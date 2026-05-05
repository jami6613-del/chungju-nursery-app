#!/usr/bin/env node
// Supabase Management API로 임의의 SQL을 실행하는 헬퍼.
//
// 사용법:
//   node --env-file=.env scripts/supabase-sql.mjs "select 1"
//   node --env-file=.env scripts/supabase-sql.mjs --file path/to/query.sql
//   echo "select 1" | node --env-file=.env scripts/supabase-sql.mjs
//
// 필요 env (.env에 정의):
//   SUPABASE_ACCESS_TOKEN  Supabase 개인 액세스 토큰 (sbp_...)
//   SUPABASE_PROJECT_REF   프로젝트 ref (예: pleekionkfdfguwgjaai)
//
// 보안: 이 스크립트는 Management API 토큰을 사용합니다. 토큰은 .env에만 두고
//       GitHub에 절대 올리지 마세요(.gitignore에 .env 포함되어 있는지 확인).

import { readFileSync } from "node:fs";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !PROJECT_REF) {
  console.error("[supabase-sql] SUPABASE_ACCESS_TOKEN 또는 SUPABASE_PROJECT_REF가 설정되지 않았습니다.");
  console.error("[supabase-sql] node --env-file=.env scripts/supabase-sql.mjs ... 형태로 실행하세요.");
  process.exit(2);
}

async function readStdin() {
  return await new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
  });
}

async function getQuery() {
  const args = process.argv.slice(2);
  if (args[0] === "--file" && args[1]) {
    return readFileSync(args[1], "utf8");
  }
  if (args.length > 0) {
    return args.join(" ");
  }
  if (!process.stdin.isTTY) {
    return await readStdin();
  }
  console.error("[supabase-sql] SQL을 인자 / --file / stdin 중 하나로 전달하세요.");
  process.exit(2);
}

const query = (await getQuery()).trim();
if (!query) {
  console.error("[supabase-sql] 빈 SQL입니다.");
  process.exit(2);
}

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
let pretty = text;
try {
  pretty = JSON.stringify(JSON.parse(text), null, 2);
} catch {
  // not JSON, leave as-is
}

if (!res.ok) {
  console.error(`[supabase-sql] HTTP ${res.status} ${res.statusText}`);
  console.error(pretty);
  process.exit(1);
}

console.log(pretty);
