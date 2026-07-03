# Floor & Mechanic JSON 規範

## 1. 地基固定參數 (Floor Fixed)
| 參數名      | 類型   | 說明                                           |
| :---------- | :----- | :--------------------------------------------- |
| `type`      | String | 地基類型 (`Box` 或 `glb`)                      |
| `size`      | Object | 僅 Box 類型使用 `{width, height, depth}`       |
| `color`     | String | 全局顏色 (若實例未定義顏色則使用此值)          |
| `instances` | Array  | 實例陣列。包含 `position`, `rotation`, `color` |
| `mechanics` | Object | 地基觸發機制 (由 `MechanicFactory` 解析)       |

## 2. 實例參數 (Instance Properties)
每個 `instances` 成員包含：
- `position`: 三維座標 `{x, y, z}`
- `rotation`: 旋轉角度 `{x, y, z}` (角度制)
- `color`: (選填) 個別實例顏色，可覆蓋父層 `color`

## 3. 機制自定義參數 (Mechanic Custom)
目前 `StandardMechanic` 類別接收以下參數：
- `max_players`: 若人數大於或等於此值，地基消失 (null 為不限制)
- `time_limit`: 玩家單獨站立後幾秒消失
- `warning_color`: 消失前的警告顏色 (如 `0xff0000`)