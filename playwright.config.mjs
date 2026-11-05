import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false,
  workers:1,
  timeout:45000,
  reporter:'list',
  use:{baseURL:process.env.BLOG_BASE_URL||'http://127.0.0.1:4321/blog/',headless:true,viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.BLOG_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-proxy-server']}},
});
