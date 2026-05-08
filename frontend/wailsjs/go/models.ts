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

}

