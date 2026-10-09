// agent_activity_logs IN POSTGRESQL
export const logger = {
  log: (action: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] ${action}`, data);
  },
  error: (action: string, data?: any) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${action}`, data);
  },
};
