# Player JSON 規範

## 1. 角色固定參數
| 參數名             | 類型   | 說明                             |
| :----------------- | :----- | :------------------------------- |
| `name`             | String | 角色名稱 (用於連動 UI)           |
| `role`             | String | 職責 (`T`, `H`, `D`)             |
| `default_position` | Object | 遊戲重置/初始位址 `{x, y, z}`    |
| `camera_offset`    | Object | 相機相對角色的偏移量 `{x, y, z}` |
| `scale`            | Float  | 模型縮放比例                     |

## 2. 移動路徑節點 (Path Node)
僅 NPC 使用，`path` 陣列包含：
- `position`: 目標座標 `{x, y, z}`
- `stay`: 抵達後的停留秒數
- `rotation`: 抵達/停留時的主動面向視角 `{x, y, z}`

## 3. 重要說明
- **座標轉換**：系統會透過 `Tool.js` 自動將 JSON 中的 `X` 座標進行鏡像轉換以符合場景方向。
- **冷卻時間**：玩家按鍵跳躍設有 `100ms` 的內建冷卻與落地判定。