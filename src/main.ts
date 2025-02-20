import { Command } from 'commander';
import * as readline from 'readline';

import { buildGraph } from "./parser.js";
import { transform } from "./transformer.js";
import { genNetlist, Module } from "./yosys.js";
import { Blueprint, createBlueprint, createBpString } from "./blueprint.js"

import * as fs from "fs";

const program = new Command("v2f");

program
    .arguments("<files..>")
    // .option("-v, --verbose")
    .helpOption("-h, --help", "Display this information.")
    .option("-s, --seed <seed>", "Specify a seed for the Layout generation.")
    .option("-o, --output <file>", "File to output the compiled blueprint to.")
    .option("-m, --modules <names...>", "Module to output blueprint for. (defaults to all)")
    .option("-f, --files <files...>", "List of Verilog files to compile. (only has to be explicitly specified after -m)");

program.parse(process.argv);

export const options: {
    seed?: string;
    output?: string;
    modules?: string[];
    files?: string[];
} = program.opts();
// options.seed

// merge default and file options
options.files = options.files ?? [];
options.files.push(...program.args);

async function validateOptions() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    if (options.files.length == 0) {
        console.log("error: no input files");
        if(options.modules) {
            console.log("did you forget -f for files?");
        }
        process.exit(0);
    }

    if (options.output) {
        if (fs.existsSync(options.output)) {
            let res = await new Promise<string>(res => rl.question(`${options.output} already exists. Overwrite? [y/n] `, res));
            if (res.toLowerCase() !== "y") {
                process.exit(0);
            }
        }
    }

    rl.close();
}

function pipeline(name: string, module: Module) {
    console.log(`Building graph for ${name}`);
    const graph = buildGraph(module);

    console.log(`Translating graph to combinators`);
    const entities = transform(graph.nodes);

    return createBlueprint(entities, name);
}

async function main() {
    await validateOptions();

    const data = await genNetlist(options.files);
    const modules: Blueprint[] = [];

    let keys = new Set(options.modules ?? Object.keys(data.modules));

    for (const key of keys) {
        let module = data.modules[key];
        if (!module) {
            console.log(`error: Module ${key} not found`);
            process.exit(0);
        }
        modules.push(pipeline(key, module));
    }

    const string = createBpString(modules);

    if (options.output) {
        fs.writeFileSync(options.output, string);
    } else {
        console.log(string);
    }
}

main();
