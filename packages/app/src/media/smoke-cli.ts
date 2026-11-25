import "dotenv/config";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { PictRsClient } from "./PictRsClient.js";

const pictRsUrl = process.env.PICTRS_URL;
const pictRsApiKey = process.env.PICTRS_API_KEY;
if (!pictRsUrl || !pictRsApiKey) {
    throw new Error("PICTRS_URL e PICTRS_API_KEY são obrigatórios.");
}

const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVQI12P8z4AdMDEMKQkAzUEBD9aGuoAAAAAASUVORK5CYII=",
    "base64"
);
const boundary = "pomi-media-smoke";
const body = Buffer.concat([
    Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images[]"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`)
]);
const client = new PictRsClient(pictRsUrl, pictRsApiKey);
let alias: string | undefined;

try {
    await client.health();
    const uploaded = await client.upload(
        Readable.from([body]),
        `multipart/form-data; boundary=${boundary}`,
        AbortSignal.timeout(30_000)
    );
    alias = uploaded.alias;
    assert.equal(uploaded.width, 8);
    assert.equal(uploaded.height, 8);
    const variant = await client.readVariant(
        alias,
        "avatarSmall",
        AbortSignal.timeout(30_000)
    );
    const header = Buffer.alloc(12);
    let copied = 0;
    for await (const chunk of variant) {
        const bytes = Buffer.from(chunk);
        if (copied < header.length) {
            copied += bytes.copy(header, copied, 0, header.length - copied);
        }
    }
    assert.equal(copied, 12);
    assert.equal(header.toString("ascii", 0, 4), "RIFF");
    assert.equal(header.toString("ascii", 8, 12), "WEBP");
    const page = await client.listAliases(
        undefined,
        AbortSignal.timeout(30_000)
    );
    const listed = page.aliases.find((entry) => entry.alias === alias);
    assert.ok(listed?.createdAt);
    process.stdout.write("pict-rs: health, upload, WebP e enumeração OK\n");
} finally {
    if (alias) {
        await client.deleteAlias(alias, AbortSignal.timeout(30_000));
        process.stdout.write("pict-rs: alias de teste excluído\n");
    }
}
