# チーム分け

メンバーを公平にチーム分けし、好きな順番で一人ずつ結果を公開できるローカルWebアプリです。

## 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

## 確認

```bash
npm test
npm run build
```

抽選には `crypto.getRandomValues()` とFisher–Yates法を使用します。固定割り当てがある場合は、実現可能な最終人数パターンを割り当て総数で重み付けし、有効な完成形が一様になるように選択します。
