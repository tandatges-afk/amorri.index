import { test,expect } from '@playwright/test';
test('health and home are reachable',async ({page,request})=>{
 const health=await request.get('/api/health');expect(health.ok()).toBeTruthy();
 await page.goto('/');await expect(page).toHaveTitle(/Amorri Studio/i);
});
test('legacy event and client gallery DOM are served',async ({request})=>{
 const response=await request.get('/studio');expect(response.ok()).toBeTruthy();
 const html=await response.text();expect(html).toContain('id="eventModal"');expect(html).toContain('id="clientGalleryView"');
});
test('anonymous booking creation denied',async ({request})=>{
 const response=await request.post('/api/events',{data:{}});expect([401,403]).toContain(response.status());
});
test('2.4 protects migration diagnostics from anonymous access',async ({request})=>{
 const response=await request.get('/api/migration/diagnostics');
 expect(response.status()).toBe(401);
 const json=await response.json();expect(json.code).toBe('AUTH_TOKEN_MISSING');
});
test('2.4 migration policy and identity endpoints fail safely',async ({request})=>{
 const policy=await request.get('/api/access/policy');expect(policy.status()).toBe(200);
 const config=await policy.json();expect(['compat','read-only']).toContain(config.legacyAdminWrites);
 expect(config.serverEnforcedWrites).toBe(false);
 const me=await request.get('/api/access/me');expect(me.status()).toBe(401);
});
