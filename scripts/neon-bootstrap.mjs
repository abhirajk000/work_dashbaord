import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const credPath = join(homedir(), ".config", "neonctl", "credentials.json");
const creds = JSON.parse(readFileSync(credPath, "utf8"));
const token = creds.access_token;

async function api(path, options = {}) {
  const res = await fetch(`https://console.neon.tech/api/v2${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

let orgs = await api("/users/me/organizations");
if (!orgs.organizations?.length) {
  console.log("Creating Neon organization…");
  await api("/organizations", {
    method: "POST",
    body: JSON.stringify({ organization: { name: "abhiraj" } }),
  });
  orgs = await api("/users/me/organizations");
}

const orgId = orgs.organizations[0].id;
const projects = await api(`/projects?org_id=${orgId}`);
if (!projects.projects?.length) {
  console.log("Creating Neon project…");
  const created = await api("/projects", {
    method: "POST",
    body: JSON.stringify({
      project: { name: "productivity-dashboard", region_id: "aws-us-east-1", org_id: orgId },
    }),
  });
  const project = created.project;
  const conn = await api(`/projects/${project.id}/connection_uri?database_name=neondb&role_name=neondb_owner`);
  console.log(JSON.stringify({ projectId: project.id, databaseUrl: conn.uri }, null, 2));
} else {
  const project = projects.projects[0];
  const conn = await api(`/projects/${project.id}/connection_uri?database_name=neondb&role_name=neondb_owner`);
  console.log(JSON.stringify({ projectId: project.id, databaseUrl: conn.uri }, null, 2));
}
