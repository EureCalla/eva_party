# 2026_xmas_party

好孕敲門・交換禮物 Party 的猜禮物遊戲（孕婦歡送 Party）。

- UI：HTML 前端（HTML / CSS / JavaScript），後端 Python 標準庫 + SQLite，不需安裝套件
- 角色與色票沿用邀請影片（原始檔在 `video/`），`static/sprites.js` 由 `video/compositions/story.html` 原樣抽出

## 啟動

```bash
python app.py
```

- 本機：http://localhost:8477
- 手機：同一個網路連 `http://{本機 IP}:8477`（啟動時會印出）

## 玩法

1. 邀請函動畫 → 進入派對
2. 選自己的英文名字登入（依字母排序），暗號 `4638`（管理者為 `eva`）
3. 禮物牆有 27 個「{動物}的禮物」，點你覺得是自己的那一個
   - 猜對：禮物長出腳，原地蹲站蹲站
   - 猜錯：禮物搖頭，可以再猜
4. 猜對後幫禮物選一個標籤（寶、貝、珍珠、欣、Eva、Baby、欣加Pearl、媽媽、男、孩、威），
   禮物換成該標籤的顏色並顯示標籤；點自己的禮物可以改
   - 每個人只看得到自己禮物的標籤與顏色，別人的禮物只看得到有沒有長腳跳舞

## 活動階段

對號入座 → 公布標籤 → 交換禮物遊戲 → 共享盛宴。禮物牆招牌下方的進度條顯示目前到哪個節點。

- 只有「對號入座」可以猜禮物、選／改標籤；之後的階段禮物牆只能看
- 從「公布標籤」起，所有人看得到全部標籤與顏色
- 目前階段存在 DB 的 `settings.stage`，階段定義在 `mpivr20_cms.STAGES`

## 管理頁（管理者限定）

管理者登入後禮物牆右上角有「管理」按鈕：
- **活動階段**：選階段按送出，可任意切換（按錯可切回）
- **人員管理**：新增（暗號預設 4638，勾管理者則為 eva）、修改英文名／動物／暗號／管理者、刪除（軟刪除，會釋放他認領的禮物）
  - 勾選或取消管理者時若沒手動改暗號，暗號自動換成該身分的暗號（管理者 eva、一般人見下）；有手動改則以手動為準
  - **一般人暗號**：人員管理上方可一次修改所有非管理員的暗號，值存在 `settings.user_password`（未設定時為 4638），之後新增或降為一般人的人都用這個暗號；管理者暗號不受影響
- 不能刪除自己，也不能拿掉自己的管理者權限

登入頁與禮物牆右上角有「預告片」與「邀請函」按鈕：
- 預告片：與邀請影片同一份像素動畫，在瀏覽器即時播放（`static/trailer.js`），可暫停、拖動進度、重播
  - 播放列下方是集數按鈕，像影集一樣可以切換；只列已經做好的集數
  - 第一集（28 秒）：小貓包禮物、懷孕、換洋裝、讀邀請函、店門口翻招牌
  - 第二集（30 秒，`static/ep2.js`）：小貓散步遇到狐獴、水獺、長頸鹿圍觀大象吹茶葉蛋，蛋掉到狐獴頭上；小貓拋名牌公布名字（狐獴 Ethan、水獺 Ann、長頸鹿 Charlotte、大象 Allen），大家跟著小貓走出畫面
- 邀請函：邀請函規則，加上派對時間與預算

## 資料

- 資料庫：`\\mpi-file01\VPCRD2-AI\86_LEVELOO\2026_xmas\game.db`（路徑在 `mpivr20_cms.py`）
- 使用者只存在資料庫的 `players` 表（英文名、動物、暗號），登入選單與暗號檢查都直接讀 DB
  - 新增使用者：`python tools/add_player.py 名字 動物`（預設暗號 4638，加 `--admin` 為管理者、暗號 eva，可用 `--password` 自訂），排在禮物牆最後，不影響已認領的資料；server 不必重啟
  - 列出使用者：`python tools/add_player.py --list`
  - 權限：`players.permission` 為 `user` 或 `admin`，新增時加 `--admin` 即為管理者；管理功能一律由 server 端以 `GameDB.is_admin()` 檢查
  - ⚠️ 刪掉 DB 會連使用者一起消失，要重建得逐一用 `add_player.py` 加回
- 禮物標籤記在 `players.label`，標籤清單在 `mpivr20_cms.GIFT_LABELS`，顏色在 `static/game.js` 的 `LABEL_COLORS`
- Schema 變更放 `migrations/`，啟動時自動套用

## 開發

- 預告片改了（`video/compositions/` 下的任一集）要重新產生：`python tools/build_trailer.py`
  - 不用 mp4 是因為匯出的影片是 mp4v 編碼，瀏覽器與手機都播不了
- 新增一集（以第三集為例）：
  1. 在 `video/compositions/` 放 `ep3.html`（同 `ep2.html` 的格式：canvas id 為 `story-canvas`、有 `/*SPRITES*/` 區塊與 `const state = { t: 0 };`），並加進 `export_pieces.py` 的 `COMPOSITIONS`
  2. `tools/build_trailer.py` 的 `EPISODES` 加一筆 `(3, "第三集", "ep3.html", "ep3.js")`，執行 `python tools/build_trailer.py`
  3. `static/index.html` 在 `ep2.js` 後面加 `<script src="ep3.js"></script>`，集數按鈕就會自動出現

- `http://localhost:8477/?t=2.5`：把邀請函動畫凍結在第 2.5 秒，方便截圖驗收

## 素材

邀請影片原本是獨立的 HyperFrames 專案（`D:\xmas-party-invite`），現在改由遊戲頁面的預告片即時播放，原始檔整理進本 repo：

| 路徑 | 內容 |
|---|---|
| `video/index.html` | HyperFrames 根 composition（28 秒） |
| `video/compositions/story.html` | 第一集動畫主程式；`/*SPRITES*/` 區塊由 `export_pieces.py` 自動產生，不要手改 |
| `video/compositions/ep2.html` | 第二集動畫主程式（同上） |
| `video/SPEC.md` | 影片規格：配色、動作、分鏡、禁用元素 |
| `video/design/cat_sprites.py` | 角色點陣原稿，輸出 `character_sheet_v7.png` |
| `video/design/export_pieces.py` | 紙娃娃零件產生器，注入各集 composition、寫出 `static/sprites.js`，並輸出 `pieces_preview.png` |
| `video/design/animals.py` | 第二集的動物（狐獴、水獺、長頸鹿、大象）、茶葉蛋、名牌、問號零件 |
| `video/design/encode.py` | 影格轉 mp4（OpenCV，沒有 FFmpeg 時用） |
| `video/design/cat_smooth.py`、`compare_pixel_vs_smooth_v1.png` | 一般動畫版對照（未採用） |
| `video/design/reference/` | 原始參考照片 |
| `video/design/archive/` | v1 毛茸茸版程式（封存） |
| `video/assets/sfx/` | 備用音效（pop、whoosh、sparkle），目前未使用 |
| `assets/animals/` | 參加者的動物圖與名單 Excel（遊戲以 Excel 為準，圖目前未使用） |

改角色零件的流程：

```bash
python -X utf8 video/design/export_pieces.py   # 重新產生零件，注入各集 composition 並寫出 static/sprites.js
python tools/build_trailer.py                  # 重新產生各集預告片（static/trailer.js、ep2.js）
```

各版 mp4 成品（v3～v5，mp4v 編碼）與輸出用的影格暫存檔沒有進版控，仍留在 `D:\xmas-party-invite\renders\`。
