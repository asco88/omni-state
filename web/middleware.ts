export { auth as middleware } from "@/auth";

export const config = {
  // Protect only the dashboard page — API routes handle their own auth
  matcher: ["/"],
};
