$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psql)) { $psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe" }
if (-not (Test-Path $psql)) { $psql = "C:\Program Files\PostgreSQL\15\bin\psql.exe" }
if (-not (Test-Path $psql)) { $psql = "C:\Program Files\PostgreSQL\14\bin\psql.exe" }
if (-not (Test-Path $psql)) { Write-Error "psql.exe not found"; return }

$env:PGPASSWORD = "dira_local_dev_only"
$psqlArgs = @("-h", "localhost", "-p", "5433", "-U", "dira_dev", "-d", "dira_dev")

# 1. Find learner in T001's class
$q = @"
SELECT l.learner_id, l.display_name, c.class_id, c.grade_level
FROM learners l
JOIN learner_enrollments e ON e.learner_id = l.learner_id
JOIN classes c ON c.class_id = e.class_id AND c.school_id = e.school_id AND c.academic_year = e.academic_year
JOIN timetable_assignments ta ON ta.class_id = c.class_id AND ta.academic_year = c.academic_year
WHERE e.school_id = 'SCH001' AND e.academic_year = 2026
  AND e.enrolment_status <> 'Withdrawn' AND ta.teacher_id = 'T001'
  AND ta.valid_from <= CURRENT_DATE AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
GROUP BY l.learner_id, l.display_name, c.class_id, c.grade_level LIMIT 1;
"@

$r = & $psql $psqlArgs -t -c $q
if (-not $r.Trim()) { Write-Error "No learner in T001's classes"; return }

$p = $r.Trim().Split("|")
$learner_id, $learner_name, $class_id, $grade = $p[0].Trim(), $p[1].Trim(), $p[2].Trim(), $p[3].Trim()
Write-Host "Learner: $learner_id - $learner_name ($grade, $class_id)"

# 2. Insert 3 reviewed observations
$dates = "2026-02-15","2026-03-20","2026-04-25"
$teachers = "T001","T002","T003"
$contexts = "Group project","Whole-class discussion","Pair work"
$types = "participation","academic","behavioral"

for ($i=0; $i -lt 3; $i++) {
    $oid = "OBS-TEST-{0:D6}" -f (Get-Random -Max 999999)
    $sid = "sub-test-{0:D6}" -f (Get-Random -Max 999999)
    $cal = (& $psql $psqlArgs -t -c "SELECT calendar_entry_id FROM school_calendar WHERE class_id = '$class_id' AND calendar_date = '$($dates[$i])' LIMIT 1;").Trim()
    
    $insertQuery = @"
INSERT INTO observations (observation_id, learner_id, teacher_id, school_id, class_id, academic_year,
  observation_date, observed_at, term, calendar_entry_id, observation_type, original_observation,
  subject, activity_context, source_type, capture_method, possible_theme, verification_status,
  submission_id, linked_test_id, teacher_review_status)
VALUES ('$oid', '$learner_id', '$($teachers[$i])', 'SCH001', '$class_id', 2026,
  '$($dates[$i])', '$($dates[$i]) 09:00:00+00', 'Term 1', '$cal', '$($types[$i])',
  'Test observation $($i+1) for suggest test', 'Mathematics', '$($contexts[$i])',
  'Text note', 'text', 'Collaboration', 'Verified by multiple teachers', '$sid', '', 'confirmed')
ON CONFLICT (observation_id) DO NOTHING;
"@

    & $psql $psqlArgs -c $insertQuery
    Write-Host "  Added $oid ($($types[$i]) on $($dates[$i]) by $($teachers[$i]))"
}

Write-Host "`nTest with: curl -X POST http://localhost:3000/api/mcp/suggest-test -H 'Content-Type: application/json' -d '{\"action\":\"suggest\",\"learner_id\":\"$learner_id\"}'"
Write-Host "Learner ID: $learner_id"