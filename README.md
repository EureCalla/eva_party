# 2026_xmas_party

好孕敲門・交換禮物 Party 的猜禮物遊戲（孕婦歡送 Party）。

- UI：HTML 前端（HTML / CSS / JavaScript），後端 Python 標準庫 + SQLite，不需安裝套件
- 角色與色票沿用邀請影片（`D:\xmas-party-invite`），`static/sprites.js` 由影片的 `compositions/story.html` 原樣抽出

## 啟動

```bash
python app.py
```

- 本機：http://localhost:8477
- 手機：同一個網路連 `http://{本機 IP}:8477`（啟動時會印出）

## 玩法

1. 邀請函動畫 → 進入派對
2. 選自己的英文名字登入（依字母排序），預設暗號 `eva`
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
- **人員管理**：新增（暗號預設 eva）、修改英文名／動物／管理者、刪除（軟刪除，會釋放他認領的禮物）
- 不能刪除自己，也不能拿掉自己的管理者權限

登入頁與禮物牆右上角有「預告片」與「邀請函」按鈕：
- 預告片：與邀請影片同一份像素動畫，在瀏覽器即時播放（`static/trailer.js`），可暫停、拖動進度、重播
- 邀請函：邀請函規則，加上派對時間與預算

## 資料

- 資料庫：`\\mpi-file01\VPCRD2-AI\86_LEVELOO\2026_xmas\game.db`（路徑在 `mpivr20_cms.py`）
- 使用者只存在資料庫的 `players` 表（英文名、動物、暗號），登入選單與暗號檢查都直接讀 DB
  - 新增使用者：`python tools/add_player.py 名字 動物`（預設暗號 eva，可加 `--password`），排在禮物牆最後，不影響已認領的資料；server 不必重啟
  - 列出使用者：`python tools/add_player.py --list`
  - 權限：`players.permission` 為 `user` 或 `admin`，新增時加 `--admin` 即為管理者；管理功能一律由 server 端以 `GameDB.is_admin()` 檢查
  - ⚠️ 刪掉 DB 會連使用者一起消失，要重建得逐一用 `add_player.py` 加回
- 禮物標籤記在 `players.label`，標籤清單在 `mpivr20_cms.GIFT_LABELS`，顏色在 `static/game.js` 的 `LABEL_COLORS`
- Schema 變更放 `migrations/`，啟動時自動套用

## 開發

- 預告片改了（`D:\xmas-party-invite\compositions\story.html`）要重新產生：`python tools/build_trailer.py`
  - 不用 mp4 是因為匯出的影片是 mp4v 編碼，瀏覽器與手機都播不了

- `http://localhost:8477/?t=2.5`：把邀請函動畫凍結在第 2.5 秒，方便截圖驗收
