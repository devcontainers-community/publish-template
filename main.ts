#!/usr/bin/env -S deno run -A
import { readFile } from "node:fs/promises";
import process from "node:process";
import { $ } from "npm:zx";
import * as core from "npm:@actions/core";
import { temporaryFile, temporaryWrite } from "npm:tempy";
import { glob } from "npm:glob";

const path = core.getInput("path");
const source = core.getInput("source");
const latest = core.getBooleanInput("latest");

process.chdir(path);
$.cwd = process.cwd();

const fileList = await glob([".devcontainer/**", "devcontainer-template.json"], { ignore: [".git/**"], dot: true });

const archivePath = temporaryFile();
await $`tar -cvf ${archivePath} ${fileList}`;

const devcontainerTemplate = JSON.parse(
  await readFile("devcontainer-template.json", "utf8")
);

const image = core.getInput("image").replace("*", devcontainerTemplate.id);

const annotations = {
  $manifest: {
    "com.github.package.type": "devcontainer_template",
    "dev.containers.metadata": JSON.stringify(devcontainerTemplate),
    "org.opencontainers.image.source": source,
  },
  [archivePath]: {
    "org.opencontainers.image.title": `devcontainer-template-${devcontainerTemplate.id}.tgz`,
  },
};
const annotationsPath = await temporaryWrite(JSON.stringify(annotations), {
  extension: "json",
});

await $`oras push \
  --config /dev/null:application/vnd.devcontainers \
  --annotation-file ${annotationsPath} \
  ${image}:${devcontainerTemplate.version} \
  ${archivePath}:application/vnd.devcontainers.layer.v1+tar`;

const [major, minor, patch] = devcontainerTemplate.version
  .split(".")
  .map((x) => parseInt(x));

await $`oras tag \
  ${image}:${devcontainerTemplate.version} \
  ${image}:${major}.${minor}`;

await $`oras tag \
  ${image}:${devcontainerTemplate.version} \
  ${image}:${major}`;

if (latest) {
  await $`oras tag \
    ${image}:${devcontainerTemplate.version} \
    ${image}:latest`;
}
