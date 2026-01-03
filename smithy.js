#!/usr/bin/env bun

import {$} from "bun";
import {parseArgs} from "util";
import fs from "fs";

const {values, positionals} = parseArgs({
	args: Bun.argv,
	options: {
		lang: {type: "string"},
		optimization: {type: "string"},
		O0: {type: "boolean"},
		O1: {type: "boolean"},
		O2: {type: "boolean"},
		O3: {type: "boolean"},
		Ofast: {type: "boolean"},
	},
	strict: true,
	allowPositionals: true,
});

positionals.splice(0, 2);

const action = positionals[0];

if (!action) {
	console.error("Please specify an action.");
	process.exit(1);
}

function done(code) {
	process.exit(code || 0);
}

function getLang() {
	const lang = values.lang || "cpp";
	if (!["c", "cpp"].includes(lang)) {
		throw "Invalid language: " + lang;
	}
	return lang;
}

function getLangFlags(lang) {
	if (lang == "cpp") {
		return ["--lang-cpp", "--cpp11"];
	}

	return [];
}

function getOptimization() {
	if (values.optimization) {
		return values.optimization.trim().split(/\s+/);
	}

	for (const key of ["O0", "O1", "O2", "O3", "Ofast"]) {
		if (values[key]) {
			return [`-${key}`];
		}
	}

	return ["-O0"];
}

async function genLib() {
	if (!fs.existsSync("lib.why")) {
		await $`wasmc lib.wasm lib.why`;
	}
}

async function assemble(i) {
	await $`wasmc ${i}.wasm ${i}.base.why`;
	await genLib();
	await $`wasmc -l ${i}.why ${i}.base.why lib.why`;
	console.log(`Why binary has been written to ${i}.why.`);
}

function getID() {
	const id = positionals[1];
	if (id === undefined) {
		throw "Please specify an ID";
	}
	return id;
}

if (["g", "gen", "generate"].includes(action)) {
	const lang = getLang();
	let i = parseInt(positionals[1]);
	if (isNaN(i)) {
		i = 0;
	}

	while (fs.existsSync(`${i}.${lang}`)) {
		++i;
	}

	const filename = `${i}.${lang}`;
	await $`csmith ${getLangFlags(lang)} --seed ${i} -o ${filename}`;
	console.log(`Generated ${filename}`);
	done();
}

if (["v", "ver", "verify"].includes(action)) {
	const i = getID();

	const lang = getLang();
	const filename = `${i}.${lang}`;

	if (!fs.existsSync(filename)) {
		throw `File ${filename} not found`;
	}

	const binary = `${i}.bin`;

	await $`clang++ --std=c++20 -Wno-everything ${filename} -o ${binary}`.text();
	const nativeChecksum = (await $`./${binary}`.text()).trim().replace(/^checksum = /, "");

	console.log(`Native checksum: \x1b[32m${nativeChecksum}\x1b[39m`);
	const ll = `${i}.ll`;
	const optimization = getOptimization();
	await $`clang++ -D_BITS_FLOATN_H --std=c++20 -disable-O0-optnone -target mips64el-linux-gnu -S -emit-llvm -Wno-everything ${optimization} ${filename} -o ${ll}`;
	let wasm = "???";
	try {
		wasm = await $`ll2w ${ll} -main`.text();
	} catch (err) {
		console.log(err.stderr.toString());
		done(1);
	}
	fs.writeFileSync(`${i}.wasm`, wasm);
	await assemble(i);
	done();
}

if (["a", "asm", "assemble"].includes(action)) {
	await assemble(getID());
	done();
}