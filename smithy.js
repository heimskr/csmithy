#!/usr/bin/env bun

import {$} from "bun";
import {parseArgs} from "util";
import fs from "fs";

const {values, positionals} = parseArgs({
	args: Bun.argv,
	options: {
		lang: {
			type: "string",
		},
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

if (action == "gen") {
	const lang = getLang();
	let i = 0;

	while (fs.existsSync(`${i}.${lang}`)) {
		++i;
	}

	const filename = `${i}.${lang}`;
	await $`csmith ${getLangFlags(lang)} --seed ${i} -o ${filename}`;
	console.log(`Generated ${filename}`);
}

if (action == "verify") {
	const i = positionals[1];
	if (i === undefined) {
		throw "Please specify an ID";
	}

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
	await $`clang++ --std=c++20 -S -emit-llvm -Wno-everything ${filename} -o ${ll}`;
	await $`ll2w ${ll}`;
}
