export namespace main {
	
	export class GitRecognitionConfig {
	    show_git_branch: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GitRecognitionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.show_git_branch = source["show_git_branch"];
	    }
	}
	export class Config {
	    default_directory: string;
	    indent_guides: boolean;
	    order_directory: boolean;
	    minimap: boolean;
	    theme: string;
	    show_timestamps: boolean;
	    git_recognition: GitRecognitionConfig;
	    soft_close: boolean;
	    zoom_insights: boolean;
	    minimal_pwd: boolean;
	    default_zoom: number;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.default_directory = source["default_directory"];
	        this.indent_guides = source["indent_guides"];
	        this.order_directory = source["order_directory"];
	        this.minimap = source["minimap"];
	        this.theme = source["theme"];
	        this.show_timestamps = source["show_timestamps"];
	        this.git_recognition = this.convertValues(source["git_recognition"], GitRecognitionConfig);
	        this.soft_close = source["soft_close"];
	        this.zoom_insights = source["zoom_insights"];
	        this.minimal_pwd = source["minimal_pwd"];
	        this.default_zoom = source["default_zoom"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DBColumn {
	    name: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new DBColumn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	    }
	}
	export class DBTable {
	    name: string;
	    columns: DBColumn[];
	    rows: any[][];
	    row_count: number;
	
	    static createFrom(source: any = {}) {
	        return new DBTable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = this.convertValues(source["columns"], DBColumn);
	        this.rows = source["rows"];
	        this.row_count = source["row_count"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DBSchema {
	    tables: DBTable[];
	
	    static createFrom(source: any = {}) {
	        return new DBSchema(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tables = this.convertValues(source["tables"], DBTable);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SessionTab {
	    type: string;
	    file_path?: string;
	    language?: string;
	    cwd?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.file_path = source["file_path"];
	        this.language = source["language"];
	        this.cwd = source["cwd"];
	    }
	}

}

