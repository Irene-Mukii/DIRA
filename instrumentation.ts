export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startEducationCacheCleanup } = await import(
    "@/lib/services/education-markdown-cache"
  );
  startEducationCacheCleanup();
}
