import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

process.env.DIRA_DEMO_CALL_TEST_MODE = "true";
process.env.DIRA_DEMO_CALL_TO = "+15555550101";
process.env.AFRICASTALKING_USERNAME_VOICE = "vitest-development";
process.env.AFRICASTALKING_API_KEY_VOICE = "not-a-real-provider-key";
process.env.AFRICASTALKING_VOICE_FROM = "+15555550100";
