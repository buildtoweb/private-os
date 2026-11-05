import { withWorkflow } from 'workflow/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// Durable workflows (to-do push reminders sleep until they are due).
export default withWorkflow(nextConfig);
