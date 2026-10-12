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
