package main

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// DBColumn describes one column in a database table.
type DBColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// DBTable holds schema and row data (capped at 500 rows) for one table.
type DBTable struct {
	Name     string          `json:"name"`
	Columns  []DBColumn      `json:"columns"`
	Rows     [][]interface{} `json:"rows"`
	RowCount int             `json:"row_count"` // total rows in the actual table
}

// DBSchema is the full return value of ReadDatabase.
type DBSchema struct {
	Tables []DBTable `json:"tables"`
}

// isDBFile returns true for SQLite / generic database file extensions.
func isDBFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".db", ".sqlite", ".sqlite3", ".db3", ".s3db", ".sl3":
		return true
	}
	return false
}

// ReadDatabase opens a SQLite file and returns its tables, columns, and up to
// 500 rows per table. Returns an error if the file is not a valid SQLite db.
func (a *App) ReadDatabase(path string) (DBSchema, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return DBSchema{}, err
	}
	defer db.Close()

	// Quick connectivity check
	if err := db.Ping(); err != nil {
		return DBSchema{}, fmt.Errorf("not a valid SQLite database: %w", err)
	}

	// List user tables (skip internal sqlite_ tables)
	rows, err := db.Query(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	)
	if err != nil {
		return DBSchema{}, err
	}
	var tableNames []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err == nil {
			tableNames = append(tableNames, n)
		}
	}
	rows.Close()

	schema := DBSchema{Tables: []DBTable{}}
	for _, tname := range tableNames {
		// Columns via PRAGMA
		colRows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%q)", tname))
		if err != nil {
			continue
		}
		cols := []DBColumn{}
		for colRows.Next() {
			var cid, notNull, pk int
			var name, colType string
			var dflt interface{}
			if err := colRows.Scan(&cid, &name, &colType, &notNull, &dflt, &pk); err == nil {
				cols = append(cols, DBColumn{Name: name, Type: colType})
			}
		}
		colRows.Close()

		// Total count
		var rowCount int
		db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %q", tname)).Scan(&rowCount) //nolint:errcheck

		// Row data (limit 500)
		dataRows, err := db.Query(fmt.Sprintf("SELECT * FROM %q LIMIT 500", tname))
		if err != nil {
			schema.Tables = append(schema.Tables, DBTable{Name: tname, Columns: cols, Rows: [][]interface{}{}, RowCount: rowCount})
			continue
		}
		colNames, _ := dataRows.Columns()
		tableRows := [][]interface{}{}
		for dataRows.Next() {
			scanArgs := make([]interface{}, len(colNames))
			vals := make([]interface{}, len(colNames))
			for i := range vals {
				scanArgs[i] = &vals[i]
			}
			if err := dataRows.Scan(scanArgs...); err != nil {
				continue
			}
			row := make([]interface{}, len(colNames))
			for i, v := range vals {
				if b, ok := v.([]byte); ok {
					row[i] = string(b)
				} else {
					row[i] = v
				}
			}
			tableRows = append(tableRows, row)
		}
		dataRows.Close()

		schema.Tables = append(schema.Tables, DBTable{
			Name:     tname,
			Columns:  cols,
			Rows:     tableRows,
			RowCount: rowCount,
		})
	}
	return schema, nil
}
