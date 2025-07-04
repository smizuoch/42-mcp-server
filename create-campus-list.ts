import 'dotenv/config';
import fetch from 'node-fetch';
import * as fs from 'fs';

async function getToken() {
  const res = await fetch('https://api.intra.42.fr/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env['42_CLIENT_ID'],
      client_secret: process.env['42_CLIENT_SECRET'],
    }),
  });
  const data = await res.json() as any;
  return data.access_token;
}

async function getAllCampuses() {
  const token = await getToken();
  let allCampuses: any[] = [];
  let page = 1;
  
  console.log('Fetching campus data...');
  
  while (true) {
    try {
      const res = await fetch(`https://api.intra.42.fr/v2/campus?page[size]=100&page[number]=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        console.log(`Failed to fetch page ${page}: ${res.status}`);
        break;
      }
      
      const campuses = await res.json() as any[];
      
      if (campuses.length === 0) {
        console.log(`No more campuses on page ${page}`);
        break;
      }
      
      allCampuses = allCampuses.concat(campuses);
      console.log(`Fetched page ${page}, total campuses: ${allCampuses.length}`);
      page++;
      
      // Avoid rate limiting
      if (page > 10) break; // Safety limit
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }
  
  console.log(`Total campuses fetched: ${allCampuses.length}`);
  
  // 国ごとにグループ化
  const campusesByCountry = allCampuses.reduce((acc: Record<string, any[]>, campus: any) => {
    const country = campus.country || 'Unknown';
    if (!acc[country]) {
      acc[country] = [];
    }
    acc[country].push(campus);
    return acc;
  }, {} as Record<string, any[]>);
  
  // 国名でソート
  const sortedCountries = Object.keys(campusesByCountry).sort();
  
  let markdown = '# 42 School Campus IDs by Country\n\n';
  markdown += `Generated on: ${new Date().toISOString()}\n`;
  markdown += `Total campuses: ${allCampuses.length}\n`;
  markdown += `Total countries: ${sortedCountries.length}\n\n`;
  markdown += '---\n\n';
  
  // Table of Contents
  markdown += '## Table of Contents\n\n';
  for (const country of sortedCountries) {
    markdown += `- [${country}](#${country.toLowerCase().replace(/\s+/g, '-')})\n`;
  }
  markdown += '\n---\n\n';
  
  for (const country of sortedCountries) {
    markdown += `## ${country}\n\n`;
    
    // 各国内でキャンパス名でソート
    const sortedCampuses = campusesByCountry[country].sort((a: any, b: any) => a.name.localeCompare(b.name));
    
    markdown += '| ID | Campus Name | City |\n';
    markdown += '|----|-------------|------|\n';
    
    for (const campus of sortedCampuses) {
      const id = campus.id;
      const name = campus.name || 'N/A';
      const city = campus.city || 'N/A';
      markdown += `| ${id} | ${name} | ${city} |\n`;
    }
    markdown += '\n';
  }
  
  // Additional information
  markdown += '---\n\n';
  markdown += '## Summary Statistics\n\n';
  markdown += '| Country | Number of Campuses |\n';
  markdown += '|---------|--------------------|\n';
  
  for (const country of sortedCountries) {
    markdown += `| ${country} | ${campusesByCountry[country].length} |\n`;
  }
  
  markdown += '\n---\n\n';
  markdown += '## Notable Campus IDs\n\n';
  markdown += '- **Tokyo, Japan**: ID 26\n';
  markdown += '- **Paris, France**: Various IDs in France section\n';
  markdown += '- **San Francisco, USA**: Check USA section\n\n';
  
  markdown += '> This list was generated using the 42 API and may not include all campuses.\n';
  markdown += '> For the most up-to-date information, please refer to the official 42 Intranet.\n';
  
  // ファイルに保存
  fs.writeFileSync('42-campus-ids.md', markdown);
  console.log('Markdown file created: 42-campus-ids.md');
  
  // 統計情報を表示
  console.log('\nCountry statistics:');
  for (const country of sortedCountries) {
    console.log(`${country}: ${campusesByCountry[country].length} campuses`);
  }
}

getAllCampuses().catch(console.error);
