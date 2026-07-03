# Monster & Skill JSON 規範

## 1. 怪物固定參數 (Monster Fixed)
| 參數名       | 類型   | 說明                          |
| :----------- | :----- | :---------------------------- |
| `name`       | String | 怪物名稱                      |
| `model`      | String | `.glb` 模型路徑               |
| `spawn_time` | Float  | 遊戲開始後幾秒出現 (0 為立即) |
| `position`   | Object | 出生座標 `{x, y, z}`          |
| `path`       | Array  | 移動路徑節點陣列              |

## 2. 技能固定參數 (Skill Fixed)
核心引擎驅動必需項目：
- `name`: 技能名稱
- `type`: 技能邏輯類別 (如 `CircleSkill`)
- `time`: 觸發時間（遊戲開始後的秒數）
- `cast_time`: 吟唱/預警持續時間（秒）
- `config`: 具體技能配置資訊

## 3. 技能配置參數 (Skill Config)
定義在 `config` 物件內：
- `position`: (選填) 施放中心點。若無則預設為怪物當前位置。
- `radius`: 預警與傷害判定半徑
- `debuff`: (選填) 命中後附加的狀態效果 (包含 `name`, `type`, `value`, `duration` 等)