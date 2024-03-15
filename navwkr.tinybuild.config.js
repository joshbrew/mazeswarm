const config = {
    bundler: { //esbuild settings, set false to skip build step or add bundle:true to config object to only bundle (alt methods)
        entryPoints: [ //entry point file(s). These can include .js, .mjs, .ts, .jsx, .tsx, or other javascript files. Make sure your entry point is a ts file if you want to generate types
            "workers/navmeshwkr.ts"
        ],
        outfile: "dist/navmeshwkr.js", //exit point file, will append .js as well as indicators like .esm.js, .node.js for other build flags
        //outdir:'dist' //exit point folder, define for multiple entryPoints
        bundleBrowser: true, //create plain js build? Can include globals and init scripts
        bundleESM: false, //create esm module js files
        bundleTypes: false, //create .d.ts files, the entry point must be a typescript file! (ts, tsx, etc)
        bundleNode: false, //create node platform plain js build, specify platform:'node' to do the rest of the files 
        bundleHTML: false, //wrap the first entry point file as a plain js script in a boilerplate html file, frontend scripts can be run standalone like a .exe! Server serves this as start page if set to true.
        minify: true,
        sourcemap: false
        //globalThis:null //'mymodule'
        //globals:{'index.js':['Graph']}
        //init:{'index.js':function(bundle) { console.log('prepackaged bundle script!', bundle); }.toString(); } //pass stringified functions in to init bundle scripts in a custom way (e.g. for quick rebundling)     
     },
    server: false
}
export default config; //module.exports = config; //es5