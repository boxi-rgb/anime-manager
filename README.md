# 究極のアニメ管理ツール (Ultimate Anime Manager)

Anilist, Annict, Wikipediaの情報を統合した、プレミアムなアニメ視聴管理ツールです。

## 特徴
- **ハイブリッドデータ取得**: Anilistの網羅的なデータ、Annictの国内URL情報、Wikipediaの日本語あらすじを自動統合。
- **直感的なフォルダ管理**: 視聴済み、ゴミ箱（ドロップ）などの状態をワンクリックで管理。
- **VOD連携**: Netflix, Prime Videoへのダイレクトリンク、YouTube予告編の再生に対応。
- **プレミアムデザイン**: ダークモードを基調としたモダンで美しいUI。

## 使い方
1. `index.html`をブラウザで開きます。
2. 対象のシーズンを選択して「データ取得」をクリックします。
3. 気になるアニメのアイコンをクリックして管理を開始します。

## デプロイ方法 (GitHub Pages)
1. このリポジトリをGitHubにプッシュします。
2. リポジトリの **Settings > Pages** を開きます。
3. **Build and deployment > Source** で `Deploy from a branch` を選択します。
4. `main` ブランチを選択して **Save** をクリックします。
5. 数分後、`https://<USER_NAME>.github.io/<REPO_NAME>/` で公開されます。

## 注意事項
- **APIトークン**: `script.js` にはAnnictのAPIトークンが含まれています。公開リポジトリにする場合は、ご自身のトークンに変更するか、取り扱いにご注意ください。
- **再生エラー**: ローカル(file://)で実行するとYouTubeの埋め込みがブロックされる場合があります。GitHub PagesなどのWebサーバー経由では正常に動作します。
