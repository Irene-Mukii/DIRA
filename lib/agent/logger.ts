// agent_activity_logs IN POSTGRESQL

// id
// run_id
// timestamp
// agent_action
// tool_name
// tool_input
// tool_output
// status
// error
// model
// duration_ms


// RUN: abc123

// 20:01:03  agent_started
// 20:01:04  tool_call → get_observations
// 20:01:05  tool_result → 7 observations
// 20:01:07  model_reasoning
// 20:01:09  tool_call → suggest_test
// 20:01:11  tool_result → test suggestion
// 20:01:12  agent_completed

//EXPOSE FOR DEMO SAKE
