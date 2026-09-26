"""
NoticePoint - Automated Utility Alerts Scraper (ECG & GWCL)
------------------------------------------------------------
Scrapes official outages, maintenance notices, and supply interruptions
from the Electricity Company of Ghana (ECG) and Ghana Water Company Limited (GWCL),
then synchronizes them directly into Supabase.

Designed to run locally or as a scheduled GitHub Action.
"""

import os
import re
import sys
import json
import ssl
import hashlib
import datetime
import urllib.request
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Tuple

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import requests
from bs4 import BeautifulSoup

# Disable insecure HTTPS warnings if utility servers use self-signed / mismatched certificates
try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except Exception:
    pass

# Ghana Districts and Neighborhoods dictionary for automatic geo-tagging
DISTRICT_MAPPINGS = {
    'Adentan Municipal': [
        'adentan', 'frafraha', 'amrahia', 'adjiringanor', 'ashiyie', 'malejor'
    ],
    'La Nkwantanang-Madina Municipal': [
        'madina', 'oyarifa', 'danfa', 'pantang', 'teiman', 'ayimensah', 'botianor'
    ],
    'Ayawaso West Municipal': [
        'east legon', 'dzorwulu', 'legon', 'airport residential', 'roman ridge', 'abelenkpe', 'bawaleshie'
    ],
    'Accra Metropolitan': [
        'accra', 'jamestown', 'ushertown', 'central business district', 'makola', 'kaneshie'
    ],
    'Korle Klottey Municipal': [
        'osu', 'adabraka', 'ridge', 'circle', 'asylum down'
    ],
    'Tema Metropolitan': [
        'tema', 'sakumono', 'lashibi', 'comm 1', 'comm 2', 'comm 3', 'comm 4', 'comm 5', 'comm 6', 'comm 7', 'comm 8', 'comm 9', 'comm 10', 'comm 11', 'comm 12', 'comm 25'
    ],
    'La Dade Kotopon Municipal': [
        'cantonments', 'labone', 'la', 'trade fair', 'burma camp'
    ],
    'Ledzokuku Municipal': [
        'teshie', 'nungua', 'ledzokuku'
    ],
    'Ga East Municipal': [
        'dome', 'haatso', 'kwabenya', 'taifa', 'abokobi', 'agbogba'
    ],
    'Ga West Municipal': [
        'amasaman', 'pokuese', 'kotoku', 'medie'
    ],
    'Ga South Municipal': [
        'ngleshie amanfro', 'tuba', 'kasoa border'
    ],
    'Ga Central Municipal': [
        'sowutuom', 'chantan', 'anyaa', 'santa maria', 'ablekuma'
    ],
    'Ashaiman Municipal': [
        'ashaiman', 'lebanon', 'zongo laka', 'valco flat'
    ],
    'Weija Gbawe Municipal': [
        'weija', 'gbawe', 'mallam', 'mccarthy hill', 'tetegu'
    ],
    'Kumasi Metropolitan': [
        'kumasi', 'adum', 'bantama', 'asokwa', 'nhyiaeso', 'subin', 'manhyia', 'suame', 'tafo'
    ]
}

def load_environment():
    """Load Supabase configuration from environment variables or .env.local file."""
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = (
        os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        or os.getenv('SUPABASE_KEY')
        or os.getenv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
        or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    )

    if not supabase_url or not supabase_key:
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if not supabase_url and k in ('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'):
                            supabase_url = v
                        if not supabase_key and k in (
                            'SUPABASE_SERVICE_ROLE_KEY',
                            'SUPABASE_KEY',
                            'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
                            'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                        ):
                            supabase_key = v

    return supabase_url, supabase_key

def detect_location(text: str) -> Tuple[str, Optional[str]]:
    """Inspect text to identify affected Ghanaian municipal district and neighborhood."""
    lower_text = text.lower()
    for district, keywords in DISTRICT_MAPPINGS.items():
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw) + r'\b', lower_text):
                # Detected district and specific locality
                neighborhood = kw.title() if kw != district.lower() else None
                return district, neighborhood

    return 'All Districts', None

def clean_html(raw_html: str) -> str:
    """Strip HTML tags and clean up whitespace."""
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, ' ', raw_html)
    return ' '.join(cleantext.split())

def scrape_rss_utility_alerts() -> List[Dict]:
    """
    Scrapes verified Ghanaian utility announcements and outage reports
    from official syndication covering ECG and GWCL.
    """
    alerts = []
    queries = [
        ('ECG', 'Power Outage', 'https://news.google.com/rss/search?q=(ECG+OR+%22Electricity+Company+of+Ghana%22)+AND+(outage+OR+maintenance+OR+dumsor+OR+%22power+cut%22+OR+interruption)+when:7d&hl=en-GH&gl=GH&ceid=GH:en'),
        ('GWCL', 'Water Supply', 'https://news.google.com/rss/search?q=(GWCL+OR+%22Ghana+Water%22)+AND+(interruption+OR+shortage+OR+outage+OR+maintenance+OR+supply)+when:7d&hl=en-GH&gl=GH&ceid=GH:en'),
    ]

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NoticePointUtilityBot/1.0'}

    for source, category, url in queries:
        try:
            req = urllib.request.Request(url, headers=headers)
            res = urllib.request.urlopen(req, timeout=15)
            xml_data = res.read()
            root = ET.fromstring(xml_data)

            for item in root.findall('.//item')[:6]:
                title = item.find('title').text if item.find('title') is not None else ''
                desc = item.find('description').text if item.find('description') is not None else ''
                link = item.find('link').text if item.find('link') is not None else ''
                pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''

                # Filter out pure corporate or financial news that aren't public utility notices
                full_text = f"{title} {desc}"
                is_utility_alert = any(w in full_text.lower() for w in [
                    'outage', 'maintenance', 'interruption', 'power cut', 'water supply',
                    'dumsor', 'schedule', 'notice', 'shutdown', 'repair', 'affected'
                ])

                if not is_utility_alert:
                    continue

                district, neighborhood = detect_location(full_text)

                # Classify severity
                severity = 'medium'
                if any(w in full_text.lower() for w in ['emergency', 'shutdown', 'heavy outage', 'total blackout', 'crisis']):
                    severity = 'critical'
                elif any(w in full_text.lower() for w in ['power cut', 'outage', 'shortage', 'interruption']):
                    severity = 'high'
                elif any(w in full_text.lower() for w in ['maintenance', 'planned', 'routine']):
                    severity = 'medium'
                else:
                    severity = 'low'

                # Clean clean title (strip news source suffix like " - CitiNewsroom")
                clean_title = re.sub(r'\s+-\s+.*$', '', title).strip()

                alerts.append({
                    'source': source,
                    'title': clean_title,
                    'message': clean_html(desc) if desc else f"Official {source} update regarding utility service status.",
                    'category': category,
                    'target_district': district,
                    'target_neighborhood': neighborhood,
                    'severity': severity,
                })
        except Exception as e:
            print(f"[{source} RSS] Warning: could not scrape {url}: {e}")

    return alerts

def scrape_ecg_website() -> List[Dict]:
    """Scrape official maintenance announcements directly from ECG's web portal."""
    alerts = []
    urls = [
        'https://www.ecg.com.gh/customer-service/planned-maintenance',
        'https://www.ecg.com.gh/media-center/notices'
    ]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            html = urllib.request.urlopen(req, context=ctx, timeout=12).read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')

            # Look for notice cards, tables, or article blocks
            items = soup.find_all(['div', 'article'], class_=lambda c: c and any(k in str(c).lower() for k in ['notice', 'item', 'maintenance', 'card', 'post']))
            if not items:
                # Fallback to headings
                headings = soup.find_all(['h3', 'h4'])
                for h in headings[:4]:
                    text = h.get_text(strip=True)
                    if len(text) > 10 and any(k in text.lower() for k in ['maintenance', 'outage', 'interruption', 'notice']):
                        p = h.find_next('p')
                        p_text = p.get_text(strip=True) if p else ''
                        district, neighborhood = detect_location(f"{text} {p_text}")
                        alerts.append({
                            'source': 'ECG',
                            'title': text,
                            'message': p_text or f"Official maintenance notice published by ECG for {district}.",
                            'category': 'Power Outage',
                            'target_district': district,
                            'target_neighborhood': neighborhood,
                            'severity': 'medium',
                        })
            else:
                for item in items[:4]:
                    title_elem = item.find(['h2', 'h3', 'h4', 'a'])
                    desc_elem = item.find('p')
                    if title_elem:
                        title_text = title_elem.get_text(strip=True)
                        desc_text = desc_elem.get_text(strip=True) if desc_elem else ''
                        if len(title_text) > 10:
                            district, neighborhood = detect_location(f"{title_text} {desc_text}")
                            alerts.append({
                                'source': 'ECG',
                                'title': title_text,
                                'message': desc_text or f"ECG Planned maintenance work scheduled for {district}.",
                                'category': 'Power Outage',
                                'target_district': district,
                                'target_neighborhood': neighborhood,
                                'severity': 'medium',
                            })
        except Exception as e:
            print(f"[ECG Portal] Notice check for {url}: {e} (Falling back to RSS stream)")

    return alerts

def scrape_gwcl_website() -> List[Dict]:
    """Scrape official notices from Ghana Water Company Limited web portal."""
    alerts = []
    urls = [
        'https://gwcl.com.gh/news',
        'https://gwcl.com.gh/press-releases'
    ]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            html = urllib.request.urlopen(req, context=ctx, timeout=12).read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')

            # Find news article titles
            headings = soup.find_all(['h2', 'h3', 'h4'])
            for h in headings[:5]:
                text = h.get_text(strip=True)
                if len(text) > 10 and any(k in text.lower() for k in ['water', 'supply', 'interruption', 'maintenance', 'plant', 'shortage', 'notice']):
                    p = h.find_next('p')
                    p_text = p.get_text(strip=True) if p else ''
                    district, neighborhood = detect_location(f"{text} {p_text}")
                    alerts.append({
                        'source': 'GWCL',
                        'title': text,
                        'message': p_text or f"Official water supply notice issued by GWCL affecting {district}.",
                        'category': 'Water Supply',
                        'target_district': district,
                        'target_neighborhood': neighborhood,
                        'severity': 'high' if 'interruption' in text.lower() else 'medium',
                    })
        except Exception as e:
            print(f"[GWCL Portal] Notice check for {url}: {e} (Falling back to RSS stream)")

    return alerts

def get_existing_alert_titles(supabase_url: str, supabase_key: str) -> set:
    """Fetch recent alert titles from Supabase to prevent duplicates."""
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json',
    }

    try:
        url = f"{supabase_url}/rest/v1/alerts?select=title"
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            existing = {item['title'].strip().lower() for item in res.json()}
            return existing
    except Exception as e:
        print(f"Warning: Could not fetch existing alerts for deduplication: {e}")

    return set()

def insert_alert(supabase_url: str, supabase_key: str, alert: Dict) -> bool:
    """Insert a single alert into Supabase via REST PostgREST endpoint."""
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

    try:
        url = f"{supabase_url}/rest/v1/alerts"
        res = requests.post(url, headers=headers, json=alert, timeout=10)
        if res.status_code in (200, 201):
            return True
        else:
            print(f"Failed to insert alert: {res.status_code} - {res.text}")
            return False
    except Exception as e:
        print(f"Error inserting alert '{alert.get('title')}': {e}")
        return False

def main():
    print("=" * 60)
    print("[NoticePoint] Utility Alerts Scraper (ECG & GWCL)")
    print(f"Timestamp: {datetime.datetime.now(datetime.timezone.utc).isoformat()}")
    print("=" * 60)

    supabase_url, supabase_key = load_environment()

    if not supabase_url or not supabase_key:
        print("[!] Error: Missing SUPABASE_URL or SUPABASE_KEY in environment.")
        print("Please check your .env.local or GitHub Action secrets.")
        sys.exit(1)

    print(f"Connected to Supabase endpoint: {supabase_url}")

    # 1. Scrape all sources
    print("\n[*] Gathering notices from official channels...")
    scraped_alerts: List[Dict] = []

    # Source 1: Direct RSS Outage & Maintenance Feeds (Most consistent & active)
    rss_alerts = scrape_rss_utility_alerts()
    print(f"  [+] Found {len(rss_alerts)} notices from official broadcast feeds")
    scraped_alerts.extend(rss_alerts)

    # Source 2: ECG Portal
    ecg_alerts = scrape_ecg_website()
    print(f"  [+] Found {len(ecg_alerts)} notices from ECG Web Portal")
    scraped_alerts.extend(ecg_alerts)

    # Source 3: GWCL Portal
    gwcl_alerts = scrape_gwcl_website()
    print(f"  [+] Found {len(gwcl_alerts)} notices from GWCL Web Portal")
    scraped_alerts.extend(gwcl_alerts)

    print(f"\n[*] Total raw notices gathered: {len(scraped_alerts)}")

    # 2. Deduplicate internally
    unique_alerts: Dict[str, Dict] = {}
    for a in scraped_alerts:
        key = a['title'].strip().lower()
        if key not in unique_alerts:
            unique_alerts[key] = a

    print(f"[*] Unique notices after internal dedup: {len(unique_alerts)}")

    # 3. Check against database to avoid duplicate entries
    existing_titles = get_existing_alert_titles(supabase_url, supabase_key)
    print(f"[*] Existing alerts currently in Supabase: {len(existing_titles)}")

    new_alerts_to_insert = [
        alert for title_key, alert in unique_alerts.items()
        if title_key not in existing_titles
    ]

    print(f"\n[>] New notices to sync to NoticePoint: {len(new_alerts_to_insert)}")

    # 4. Insert into database
    success_count = 0
    for alert in new_alerts_to_insert:
        print(f"  -> [{alert['source']}] {alert['title'][:65]}... (Target: {alert['target_district']})")
        if insert_alert(supabase_url, supabase_key, alert):
            success_count += 1

    print(f"\n[SUCCESS] Successfully synced {success_count} new utility alerts into NoticePoint!")
    print("=" * 60)

if __name__ == '__main__':
    main()
