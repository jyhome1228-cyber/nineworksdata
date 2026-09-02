import base64
import concurrent.futures
import json
import os
import pathlib
import re
import urllib.parse
import urllib.request

OWNER = 'jyhome1228-cyber'
TOKEN = os.environ.get('GH_TOKEN', '')
ROOT = pathlib.Path('data')
PROJECTS = ROOT / 'projects'
ROOT.mkdir(exist_ok=True)
PROJECTS.mkdir(exist_ok=True)

HEADERS = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': '9w-control-fallback',
}
if TOKEN:
    HEADERS['Authorization'] = f'Bearer {TOKEN}'


def api(path, default=None):
    url = path if path.startswith('http') else f'https://api.github.com{path}'
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as exc:
        print('WARN', url, exc)
        return default


def decode_content(obj):
    if not isinstance(obj, dict) or not obj.get('content'):
        return ''
    try:
        return base64.b64decode(obj['content'].replace('\n', '')).decode('utf-8', errors='replace')
    except Exception:
        return ''


def clean_readme(text):
    text = re.sub(r'```[\s\S]*?```', ' ', text or '')
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'[#>*_`\[\]()!|~-]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:1200]


def fetch_project(repo):
    name = repo['name']
    full = repo['full_name']
    branch = repo.get('default_branch') or 'main'
    qbranch = urllib.parse.quote(branch, safe='')
    print('fallback snapshot', full)

    commits = api(f'/repos/{full}/commits?per_page=5', []) or []
    tree_obj = api(f'/repos/{full}/git/trees/{qbranch}?recursive=1', {}) or {}
    tree = [
        {k: item.get(k) for k in ('path', 'type', 'size', 'sha') if item.get(k) is not None}
        for item in (tree_obj.get('tree') or [])
    ]

    package_path = next((x['path'] for x in tree if str(x.get('path','')).lower() == 'package.json'), '')
    index_path = next((x['path'] for x in tree if str(x.get('path','')).lower() == 'index.html'), '')
    if not index_path:
        index_path = next((x['path'] for x in tree if str(x.get('path','')).lower().endswith('/index.html')), '')

    readme_obj = api(f'/repos/{full}/readme', {}) or {}
    cname_obj = api(f'/repos/{full}/contents/CNAME', {}) or {}
    package_obj = api(f'/repos/{full}/contents/{urllib.parse.quote(package_path, safe="/")}', {}) if package_path else {}
    index_obj = api(f'/repos/{full}/contents/{urllib.parse.quote(index_path, safe="/")}', {}) if index_path else {}

    readme_text = decode_content(readme_obj)
    cname_text = decode_content(cname_obj).strip()
    cname = cname_text.split()[0] if cname_text else ''
    package_text = decode_content(package_obj)[:180000]
    index_text = decode_content(index_obj)[:240000]

    compact_commits = []
    for c in commits[:5]:
        commit = c.get('commit') or {}
        author = commit.get('author') or {}
        compact_commits.append({
            'sha': c.get('sha', ''),
            'html_url': c.get('html_url', ''),
            'commit': {
                'message': commit.get('message', ''),
                'author': {
                    'name': author.get('name', ''),
                    'date': author.get('date', ''),
                },
            },
        })

    snapshot = {
        'generated_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'repo': repo,
        'commits': compact_commits,
        'tree': tree,
        'tree_truncated': bool(tree_obj.get('truncated')),
        'readme_text': readme_text[:8000],
        'readme_summary': clean_readme(readme_text),
        'cname': cname,
        'package_path': package_path,
        'package_text': package_text,
        'index_path': index_path,
        'index_text': index_text,
    }
    (PROJECTS / f'{name}.json').write_text(json.dumps(snapshot, ensure_ascii=False), encoding='utf-8')

    enriched = dict(repo)
    if cname and not enriched.get('homepage'):
        enriched['homepage'] = 'https://' + cname.lstrip('/')
        enriched['has_pages'] = True
    return enriched


repos = api(f'/users/{OWNER}/repos?per_page=100&sort=pushed&direction=desc&type=owner', []) or []
repos = [r for r in repos if not r.get('archived')]

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    enriched = list(pool.map(fetch_project, repos))

ROOT.joinpath('repos.json').write_text(json.dumps(enriched, ensure_ascii=False), encoding='utf-8')
events = api(f'/users/{OWNER}/events/public?per_page=30', []) or []
ROOT.joinpath('events.json').write_text(json.dumps(events, ensure_ascii=False), encoding='utf-8')
ROOT.joinpath('manifest.json').write_text(json.dumps({
    'owner': OWNER,
    'repo_count': len(enriched),
    'generated_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
}, ensure_ascii=False), encoding='utf-8')
print('done', len(enriched), 'repos')
