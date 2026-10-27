# チーム分け

メンバーを公平にチーム分けし、好きな順番で一人ずつ結果を公開できるローカルWebアプリです。メンバーごとに参加できる候補チームを複数指定できます。

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

抽選には `crypto.getRandomValues()` とFisher–Yates法を使用します。候補チームが少ないメンバーを優先しつつ、各段階で残りのメンバーを割り当て可能か検証し、最終的なチーム人数差を1人以内に保ちます。
