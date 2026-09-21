# -*- coding: utf-8 -*-
"""Creators API の searchItems で 候補の ASIN を さがす（一時的な 調査用）。

    py tools/search_goods.py "キーワード" ...
    SEARCH_INDEX=KindleStore で 売り場を 変えられる（既定は All）
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

TOKEN_URL = 'https://api.amazon.co.jp/auth/o2/token'
API_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems'
MARKETPLACE = 'www.amazon.co.jp'
RESOURCES = ['itemInfo.title', 'images.primary.large', 'offersV2.listings.price']


def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', **headers}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:400].replace('\n', ' ')


def main():
    cid = (os.environ.get('CREATORS_CLIENT_ID') or '').strip()
    sec = (os.environ.get('CREATORS_CLIENT_SECRET') or '').strip()
    tag = os.environ.get('AMAZON_TAG', 'redcomet-22')
    index = os.environ.get('SEARCH_INDEX', 'All')
    if cid.startswith('amzn1.oa2-cs.') and sec.startswith('amzn1.application-oa2-client.'):
        cid, sec = sec, cid
    st, tok = post(TOKEN_URL, {'grant_type': 'client_credentials', 'client_id': cid,
                               'client_secret': sec, 'scope': 'creatorsapi::default'}, {})
    if st != 200 or not tok.get('access_token'):
        sys.exit('トークンが 取れません: %s %s' % (st, tok))
    head = {'Authorization': 'Bearer ' + tok['access_token'], 'x-marketplace': MARKETPLACE}
    print('売り場:', index)

    for kw in sys.argv[1:]:
        print('\n=== 「%s」 ===' % kw)
        st, res = post(API_URL, {'keywords': kw, 'marketplace': MARKETPLACE, 'partnerTag': tag,
                                 'resources': RESOURCES, 'itemCount': 8, 'searchIndex': index}, head)
        if st != 200:
            print('  ×', st, str(res)[:200])
            continue
        items = (res.get('searchResult') or {}).get('items') or []
        for it in items:
            title = ((it.get('itemInfo') or {}).get('title') or {}).get('displayValue')
            ls = ((it.get('offersV2') or {}).get('listings') or [])
            price = ((ls[0].get('price') or {}).get('money') or {}).get('displayAmount') if ls else None
            print('    %s  %s  %s' % (it.get('asin'), price or '-', (title or '')[:60]))


if __name__ == '__main__':
    main()
