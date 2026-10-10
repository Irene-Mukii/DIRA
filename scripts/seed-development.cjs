const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const NULLABLE_COLUMNS = new Set([
  "enrolled_to",
  "valid_to",
  "planned_activity",
  "event_name",
  "event_type",
  "recorded_by_teacher_id",
  "note",
  "term",
  "calendar_entry_id",
  "subject",
  "activity_context",
  "linked_test_id",
  "observed_outcome",
  "outcome_observation_id",
  "reviewed_at",
  "review_comments",
]);

const TABLES = [
  {
    file: "schools",
    table: "schools",
    columns: ["school_id", "school_name"],
    keys: ["school_id"],
  },
  {
    file: "teachers",
    table: "teachers",
    columns: ["teacher_id", "school_id", "display_name"],
    keys: ["teacher_id"],
  },
  {
    file: "classes",
    table: "classes",
    columns: ["class_id", "school_id", "grade_level", "stream_label", "academic_year"],
    keys: ["class_id"],
  },
  {
    file: "learners",
    table: "learners",
    columns: ["learner_id", "display_name"],
    keys: ["learner_id"],
  },
  {
    file: "learner_enrollments",
    table: "learner_enrollments",
    columns: [
      "learner_id",
      "class_id",
      "school_id",
      "academic_year",
      "enrolment_status",
      "enrolled_from",
      "enrolled_to",
    ],
    keys: ["learner_id", "academic_year"],
  },
  {
    file: "timetable_assignments",
    table: "timetable_assignments",
    columns: [
      "timetable_assignment_id",
      "school_id",
      "class_id",
      "teacher_id",
      "academic_year",
      "weekday",
      "period_number",
      "start_time",
      "end_time",
      "subject",
      "valid_from",
      "valid_to",
    ],
    keys: ["timetable_assignment_id"],
  },
  {
    file: "school_calendar",
    table: "school_calendar",
    columns: [
      "calendar_entry_id",
      "school_id",
      "class_id",
      "teacher_id",
      "timetable_assignment_id",
      "calendar_date",
      "academic_year",
      "term",
      "weekday",
      "period_number",
      "start_time",
      "end_time",
      "subject",
      "planned_activity",
      "event_name",
      "event_type",
    ],
    keys: ["calendar_entry_id"],
  },
  {
    file: "observations",
    table: "observations",
    columns: [
      "observation_id",
      "learner_id",
      "teacher_id",
      "school_id",
      "class_id",
      "academic_year",
      "observation_date",
      "observed_at",
      "term",
      "calendar_entry_id",
      "observation_type",
      "original_observation",
      "subject",
      "activity_context",
      "source_type",
      "capture_method",
      "possible_theme",
      "verification_status",
      "submission_id",
      "linked_test_id",
    ],
    keys: ["observation_id"],
  },
  {
    file: "activity_tests",
    table: "activity_tests",
    columns: [
      "test_id",
      "learner_id",
      "suggested_activity",
      "activity_date",
      "conducting_teacher_id",
      "observed_outcome",
      "outcome_observation_id",
      "status",
    ],
    keys: ["test_id"],
  },
  {
    file: "attendance",
    table: "attendance",
    columns: [
      "attendance_id",
      "learner_id",
      "class_id",
      "academic_year",
      "calendar_entry_id",
      "calendar_date",
      "status",
      "recorded_at",
      "recorded_by_teacher_id",
      "source",
      "note",
    ],
    keys: ["attendance_id"],
  },
  {
    file: "teacher_reviews",
    table: "teacher_reviews",
    columns: [
      "note_id",
      "learner_id",
      "draft_text",
      "reviewer_id",
      "review_status",
      "reviewed_at",
      "review_comments",
    ],
    keys: ["note_id"],
    optional: true,
  },
];

function parseCsv(text, fileName) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error(`${fileName} ends inside a quoted CSV field.`);
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length === 0) throw new Error(`${fileName} is empty.`);

  const headers = rows.shift().map((header) => header.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error(`${fileName} has duplicate column names.`);
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`${fileName} row ${rowIndex + 2} has the wrong number of fields.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function readDataset(inputDir, definition) {
  const filePath = path.join(inputDir, `${definition.file}.csv`);
  if (!fs.existsSync(filePath)) {
    if (definition.optional) return [];
    throw new Error(`Missing ${filePath}`);
  }
  const rows = parseCsv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""), definition.file);
  for (const [rowIndex, row] of rows.entries()) {
    for (const column of definition.columns) {
      if (!(column in row)) {
        throw new Error(`${definition.file}.csv is missing required column ${column}.`);
      }
      if (!row[column] && !NULLABLE_COLUMNS.has(column)) {
        throw new Error(`${definition.file}.csv row ${rowIndex + 2} has an empty ${column}.`);
      }
    }
  }
  return rows;
}

function databaseIsLocalDevelopment(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return false;
  }
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, "")) &&
    ["5432", "5433"].includes(url.port) &&
    url.username === "dira_dev" &&
    url.pathname === "/dira_dev"
  );
}

function configuredDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(ROOT, name);
    if (!fs.existsSync(filePath)) continue;
    const line = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    if (line) {
      const value = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim();
      return value.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return undefined;
}

function* buildUpsert(definition, rows) {
  const { columns, table, keys } = definition;
  const values = [];
  const groups = [];
  const batchSize = 250;
  const identifierPattern = /^[a-z_]+$/;

  for (const column of [table, ...columns, ...keys]) {
    if (!identifierPattern.test(column)) {
      throw new Error(`Unsafe SQL identifier: ${column}`);
    }
  }

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    values.length = 0;
    groups.length = 0;
    for (const row of batch) {
      const placeholders = columns.map((column) => {
        values.push(row[column] === "" && NULLABLE_COLUMNS.has(column) ? null : row[column]);
        return `$${values.length}`;
      });
      groups.push(`(${placeholders.join(", ")})`);
    }

    const updates = columns.filter((column) => !keys.includes(column));
    const conflict = updates.length
      ? `DO UPDATE SET ${updates.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`
      : "DO NOTHING";
    yield {
      text: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${groups.join(", ")} ON CONFLICT (${keys.join(", ")}) ${conflict}`,
      values: [...values],
    };
  }
}

function relationshipRows(rows, column) {
  return rows.flatMap((row) => (
    row[column]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((reference) => ({
        learner_id: row.learner_id,
        parent_id: row.test_id ?? row.note_id,
        reference,
      }))
  ));
}

async function insertRelationships(client, table, columns, rows) {
  if (rows.length === 0) return;
  const values = [];
  const groups = [];
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    values.length = 0;
    groups.length = 0;
    for (const row of batch) {
      groups.push(`(${columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      }).join(", ")})`);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${groups.join(", ")} ON CONFLICT DO NOTHING`,
      [...values],
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--confirm-development")) {
    throw new Error("Refusing to import without --confirm-development.");
  }
  const connectionString = configuredDatabaseUrl();
  if (!connectionString || !databaseIsLocalDevelopment(connectionString)) {
    throw new Error(
      "Refusing to import: DATABASE_URL must target local dira_dev as user dira_dev.",
    );
  }

  const inputArg = args.find((arg) => arg.startsWith("--input-dir="));
  const inputDir = path.resolve(
    ROOT,
    inputArg ? inputArg.slice("--input-dir=".length) : "data/cleaned/generated_dev",
  );
  const datasets = new Map(
    TABLES.map((definition) => [definition.file, readDataset(inputDir, definition)]),
  );
  const connection = new URL(connectionString);
  if (args.includes("--check-only")) {
    for (const definition of TABLES) {
      console.log(`${definition.file}: ${datasets.get(definition.file).length} rows`);
    }
    console.log(
      `Dataset and local development target validated (${connection.hostname}${connection.pathname}); no database connection was made.`,
    );
    return;
  }
  console.log(
    `About to upsert synthetic development data into ${connection.hostname}${connection.pathname} from ${inputDir}.`,
  );

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    for (const definition of TABLES) {
      const rows = datasets.get(definition.file);
      for (const query of buildUpsert(definition, rows)) {
        await client.query(query.text, query.values);
      }
    }

    const tests = datasets.get("activity_tests");
    await insertRelationships(
      client,
      "activity_test_observations",
      ["test_id", "learner_id", "observation_id"],
      relationshipRows(tests, "trigger_observation_ids").map((row) => ({
        test_id: row.parent_id,
        learner_id: row.learner_id,
        observation_id: row.reference,
      })),
    );

    const reviews = datasets.get("teacher_reviews");
    const reviewEvidence = relationshipRows(reviews, "evidence_ids");
    await insertRelationships(
      client,
      "teacher_review_observations",
      ["note_id", "learner_id", "observation_id"],
      reviewEvidence
        .filter((row) => row.reference.startsWith("OBS"))
        .map((row) => ({
          note_id: row.parent_id,
          learner_id: row.learner_id,
          observation_id: row.reference,
        })),
    );
    await insertRelationships(
      client,
      "teacher_review_tests",
      ["note_id", "learner_id", "test_id"],
      reviewEvidence
        .filter((row) => row.reference.startsWith("TEST"))
        .map((row) => ({
          note_id: row.parent_id,
          learner_id: row.learner_id,
          test_id: row.reference,
        })),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log("Synthetic development dataset imported successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
