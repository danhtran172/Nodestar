# SPREAD

## Product & Interaction Specification V1.0

**Platform:** Windows + Web
**Product type:** Personal Vision Mapping / Visual Planning
**Primary use:** Cá nhân
**Document status:** Core Product Spec — V1
**Scope:** Product behavior, interaction, graph semantics, object model, exceptions, non-functional requirements

---

# 1. PRODUCT VISION

## 1.1 Spread là gì?

Spread là một ứng dụng visual planning dành cho cá nhân, kết hợp tư duy của:

* mind map;
* vision map;
* moodboard;
* spatial planning.

Spread giúp người dùng:

> nhìn thấy những điều họ muốn hướng tới, các khía cạnh tạo nên chúng và những con đường có thể dẫn đến nhiều đích khác nhau.

Spread không phải:

* task manager;
* project management;
* traditional hierarchical mind map;
* general whiteboard;
* note-taking database;
* diagramming tool.

Spread tập trung vào:

> **Design and follow interconnected paths toward what you want.**

---

# 2. PRODUCT PHILOSOPHY

Spread phải tạo được cảm giác:

> “Wow, app này quá tinh tế.”

“Wow” không đến từ số lượng feature.

Nó đến từ:

* thao tác tự nhiên;
* phản hồi tức thì;
* graph luôn dễ nhìn;
* animation có chủ đích;
* product xử lý complexity thay user;
* UI sạch nhưng không thiếu chức năng.

---

# 3. PRODUCT LAWS

## 3.1 Easy to Act

Người dùng phải dễ:

* nhận ra mình có thể làm gì;
* biết thao tác ở đâu;
* thực hiện với ít bước;
* đoán được kết quả trước khi thao tác hoàn tất.

Preferred loop:

```text
See
↓
Understand
↓
Act
↓
Immediate Feedback
```

Không được tạo flow kiểu:

```text
Open menu
↓
Choose tool
↓
Choose mode
↓
Configure
↓
Confirm
↓
Return to canvas
```

cho các thao tác thường xuyên.

---

## 3.2 Easy to Read

Graph readability là ưu tiên UI cao nhất.

Một graph có data phức tạp vẫn phải có visualization đơn giản.

Spread phải ưu tiên:

* spacing;
* alignment;
* branch-level auto-arrange;
* edge routing;
* visual hierarchy;
* semantic zoom;
* Focus mode.

---

## 3.3 Product Absorbs Complexity

User quyết định:

* ý tưởng;
* relationship;
* direction;
* vị trí/nhánh muốn đặt.

Spread xử lý:

* pixel positioning;
* spacing;
* edge routing;
* collision;
* reflow;
* visual density.

Nguyên tắc:

> User decides intention. Spread handles arrangement.

---

# 4. CORE PLANNING MODEL

Spread hỗ trợ đồng thời:

## 4.1 Goal-first

User biết mình muốn gì.

```text
◎ Build my studio
        ↑
   Finance
        ↑
Increase income
```

User bắt đầu từ Goal rồi phát triển các contributor.

---

## 4.2 Discovery-first

User bắt đầu từ:

* ideas;
* Nodes;
* Seeds;
* Images;
* Imagination.

Sau đó dần phát hiện:

* relationships;
* paths;
* goals.

---

## 4.3 Graph model

Spread không sử dụng strict tree.

Một Node có thể:

* đóng góp cho nhiều Goal;
* nhận đóng góp từ nhiều Node;
* nằm trên nhiều PATH;
* tiếp tục phát triển sau khi đã phục vụ một Goal.

Ví dụ:

```text
             ◎ Goal A
                ↑
             Portfolio
             ↗       ↘
        Practice    Network
                         ↓
                      ◎ Goal B
```

---

# 5. SPATIAL MODEL

## 5.1 Central Node

Một Vision Map có một **Central Spatial Anchor**.

Central Node:

* là điểm khởi đầu bố cục;
* giúp graph tỏa ra ngoài;
* không phải semantic root;
* không bắt tất cả Nodes phải có PATH với nó.

---

## 5.2 Expansion direction

Graph mặc định:

> **spread outward from center.**

Các branch được bố trí tỏa ra ngoài từ vùng trung tâm.

Spatial direction và semantic PATH direction là hai khái niệm độc lập.

Ví dụ:

Spatial:

```text
◎ Goal ───── [ Contributor ]
            outward →
```

Semantic:

```text
Contributor → ◎ Goal
```

---

# 6. CORE CANVAS OBJECTS

```text
CanvasObject
├── Node
│   ├── Normal
│   └── Goal
│
├── SeedBox
│   └── Seed[]
│
└── Imagination
    └── Image[]
```

Relationship là entity độc lập giữa các Canvas Object hợp lệ.

---

# 7. NODE

## 7.1 Purpose

Node đại diện cho:

> một point có ý nghĩa trong kế hoạch hoặc vision graph.

Node không có semantic type bắt buộc như:

* Task;
* Milestone;
* Habit;
* Area;
* Decision.

User tự quyết định meaning thông qua nội dung và relationship.

---

# 8. NORMAL NODE

## 8.1 Data

Normal Node gồm:

```text
Node {
    id
    mapId
    role: NORMAL | GOAL

    text
    note?

    imageId?

    width
    position/layout metadata

    createdAt
    updatedAt
}
```

---

## 8.2 Main text

Canvas chỉ hiển thị:

* main text;
* optional image.

Long-form detail không hiển thị trực tiếp trên graph.

---

## 8.3 Note / Detail

Node có optional detail/note.

Entry:

* select Node;
* mở Detail từ contextual action hoặc right-side panel.

Display:

* right-side panel.

Không tự hiển thị preview nhiều dòng trên Node.

---

# 9. GOAL

## 9.1 Concept

Goal là **role của Node**, không phải object type mới.

```text
Node
├── role: NORMAL
└── role: GOAL
```

User-facing action:

**Mark as Goal**

Reverse:

**Unmark Goal**

---

## 9.2 Purpose

Goal là:

> visual + semantic anchor.

Goal không tự động có:

* status;
* progress;
* deadline;
* completion;
* KPI;
* checklist.

---

## 9.3 Visual hierarchy

Goal phải nổi bật hơn Normal Node bằng:

* larger preset;
* stronger typography;
* stronger visual identity;
* hero image nếu có;
* prominence cao hơn khi zoom xa.

Goal không cần sử dụng màu sắc quá mạnh.

---

## 9.4 Mark as Goal

Entry:

```text
Select Node
→ contextual action / More
→ Mark as Goal
```

Output:

```text
Normal Node
↓
Goal
```

Không thay đổi:

* text;
* image;
* notes;
* relationships;
* layout attachment.

Không tự động reverse edge cũ.

---

# 10. NODE IMAGE

## 10.1 Limit

Normal Node:

> tối đa 1 image.

Goal:

> tối đa 1 hero image.

Chỉ Imagination cho phép nhiều image.

---

## 10.2 Normal Node layout

```text
[thumbnail] Main text
```

Image là secondary.

Text vẫn là identity chính.

---

## 10.3 Goal layout

```text
┌────────────────────┐
│     HERO IMAGE     │
├────────────────────┤
│    ◎ Goal Name     │
└────────────────────┘
```

Image có prominence cao hơn.

---

## 10.4 Crop behavior

Default:

**cover crop**

User có thể:

* reposition;
* adjust focal area.

Không expose các option:

* contain;
* stretch;
* custom layout;

trong V1.

---

# 11. IMAGE INPUT RULES

## 11.1 Normal Node selected

Paste/drop image:

→ set image.

Nếu Node đã có image:

→ replace existing image.

Không tạo image thứ hai.

---

## 11.2 Goal selected

Paste/drop image:

→ set/replace hero image.

---

## 11.3 Imagination selected

Paste/drop:

→ add image.

---

## 11.4 Nothing selected

Paste image:

→ create new Imagination gần current viewport.

---

## 11.5 Seed Box selected

Seed Box không nhận image.

Paste image:

→ create new Imagination gần Seed Box/current viewport.

---

# 12. NODE SIZE

Hybrid sizing.

## Normal Node

* auto height;
* user-adjustable width;
* min/max width;
* image + text determine height.

## Goal

* auto height;
* larger default width/preset;
* user-adjustable width trong giới hạn;
* hero image determines phần lớn visual height.

## Imagination / Seed Box

Resize tự do hơn.

---

# 13. RELATIONSHIP MODEL

Spread V1 có đúng 3 relationship types.

```text
PATH
RELATED
REFERENCE
```

Không thêm relationship thứ 4 nếu chưa có concrete use case.

---

# 14. PATH

## 14.1 Semantic

```text
A → B
```

nghĩa là:

> **A contributes toward B.**

Không bắt buộc nghĩa:

* A hoàn thành trước B;
* B phụ thuộc cứng vào A;
* A là child của B.

---

## 14.2 Direction

PATH là directed.

Direction hiển thị rõ trên graph.

---

## 14.3 Cycles

PATH không cho phép cycles.

Invalid:

```text
A → B → C
↑       ↓
└───────┘
```

Nếu user cố tạo cycle:

* preview relationship ở invalid state;
* drop không commit;
* lightweight message:

```text
This would create a circular path.
```

Không modal.

---

## 14.4 Multi-path

Cho phép:

```text
A → C
A → B → C
```

Cho phép:

```text
A ─┐
   ├→ C
B ─┘
```

Cho phép:

```text
A → Goal A
│
└→ Goal B
```

---

# 15. RELATED

Semantic:

```text
A — B
```

nghĩa là:

> A và B có contextual association nhưng không tạo path.

RELATED:

* undirected;
* visually quieter than PATH;
* không tham gia downstream;
* không tham gia branch drag traversal;
* không tự reconnect khi Node bị delete.

---

# 16. REFERENCE

REFERENCE dành cho:

```text
Imagination ⇢ Node / Goal
```

Semantic:

> Imagination visually references / supports understanding of that Node.

REFERENCE:

* automatically selected cho Imagination connection;
* many-to-many;
* visually de-emphasized;
* không tham gia PATH structure;
* không ảnh hưởng downstream traversal.

---

# 17. RELATIONSHIP PRIORITY

Visual prominence:

```text
PATH
↓ strongest

RELATED
↓ lighter

REFERENCE
↓ lightest
```

Ở zoom xa:

* PATH remains;
* RELATED may fade/hide;
* REFERENCE may hide.

---

# 18. DUPLICATE RELATION RULE

Không cho duplicate relationship cùng type:

```text
A → B
A → B
```

không hợp lệ.

---

## 18.1 Self relation

Không cho:

```text
A → A
```

với mọi relationship type.

---

## 18.2 Relationship pair

Một pair object không nên đồng thời có:

```text
A → B
A — B
```

trong V1.

User phải chọn primary meaning.

REFERENCE là special case của Imagination.

---

# 19. CREATING A BRANCH WITH "+"

Đây là primary graph interaction.

## 19.1 Normal Node

Hover/select Node:

→ hiện `+`.

Click:

```text
A
↓ +
A → New Node
```

Behavior:

1. create Normal Node;
2. place outward from current node;
3. create PATH;
4. select New Node;
5. activate inline text editing.

Default direction:

```text
Current → New
```

PATH có thể Reverse sau.

---

## 19.2 Goal

Goal `+` có semantic khác vì user đã explicit mark Goal.

Click `+`:

```text
New Contributor → ◎ Goal
```

Spatially New Contributor vẫn được đặt outward.

Semantic arrow hướng vào Goal.

---

## 19.3 Empty Node creation

Nếu user click `+`, tạo Node nhưng:

* không nhập text;
* cancel;
* hoặc blur khi vẫn empty;

→ remove temporary Node + temporary relationship.

---

# 20. CREATE MENU

Main toolbar có:

```text
+ Create
```

Menu:

```text
Node
Goal
Seed Box
Imagination
```

Goal creation:

→ create Node với `role = GOAL`.

---

# 21. CREATING INDEPENDENT NODE

Supported secondary entry:

* double-click empty canvas;
* Create → Node.

Result:

→ Node không có relationship.

---

# 22. ADDING RELATIONSHIP BETWEEN EXISTING OBJECTS

User phải có cách connect objects đã tồn tại.

Entry:

* select object;
* Connect contextual action / connection affordance;
* chọn target.

Output:

* PATH default giữa Node ↔ Node;
* RELATED selectable;
* REFERENCE automatic với Imagination.

User không phải chọn relation type trước mỗi connection.

Default:

PATH.

Sau creation user có thể:

* Reverse;
* change PATH ↔ RELATED;
* Delete.

---

# 23. RELATIONSHIP DELETE

Relationship là entity độc lập.

```text
A → B
```

Delete edge:

```text
A     B
```

Không xóa Node.

No confirmation.

Undo available.

---

# 24. AUTO-ARRANGE PRINCIPLE

Spread sử dụng:

> **Predictive branch-level auto-arrange.**

User phải biết graph sẽ thành gì **trước khi drop**.

---

# 25. NODE DRAG STATES

## 25.1 Pick Up

User drag Node.

Selected object được visually lifted.

Old position có thể giữ placeholder nhẹ.

---

## 25.2 Predictive Preview

Spread detect candidate semantic slot.

Hiển thị:

* prospective position;
* affected relationship;
* surrounding node reflow;
* edge route preview.

Data chưa commit.

---

## 25.3 Drop

Commit:

* new layout;
* relationship changes;
* branch reflow.

Undo tạo một atomic history action.

---

# 26. BRANCH DRAG

Default:

> kéo một Node → kéo toàn bộ downstream PATH theo.

Downstream = tất cả Node reachable qua outgoing PATH.

RELATED/REFERENCE không tính.

---

## 26.1 Shared downstream

Nếu downstream Node cũng nằm trên path khác:

→ vẫn đi theo branch đang kéo.

External relationship giữ nguyên và có thể:

* stretch;
* reroute.

Không dừng branch drag tại shared Node.

---

# 27. MULTI-SELECT DRAG

Nếu user explicit multi-select:

```text
Ctrl + Click
```

hoặc marquee:

→ drag chỉ move đúng selected objects.

Không implicit branch drag ngoài selection.

---

# 28. SELECT BRANCH

Action:

**Select Branch**

Select:

* current Node;
* toàn bộ downstream PATH.

Sau đó:

* Move;
* Copy;
* Delete;
* Duplicate;

được xử lý như multi-selection.

---

# 29. DRAG RE-PARENT

Drag có thể thay relationship.

Ví dụ:

```text
A → B → C
```

drag branch B sang D:

```text
D → B → C
```

Relationship:

```text
A → B
```

được thay bằng:

```text
D → B
```

Các relationship khác giữ nguyên.

---

# 30. LAYOUT ATTACHMENT

Nếu B có nhiều incoming PATH:

```text
A ─┐
   ├→ B
X ─┘
```

Spread giữ một internal concept:

**layout attachment**

Không expose cho user.

Khi re-parent:

* chỉ incoming PATH đang là layout attachment được thay;
* incoming PATH khác giữ nguyên.

---

# 31. AUTO-REFLOW SCOPE

Auto-arrange sử dụng:

> **branch-level reflow.**

Spread được phép:

* shift Nodes trong branch liên quan;
* tạo spacing;
* giảm overlap;
* điều chỉnh edge routing.

Không được:

* global shuffle;
* đẩy Goal xa không liên quan;
* di chuyển branch ở xa;
* di chuyển Seed Box/Imagination không liên quan.

---

# 32. DESTINATION STABILITY

Goal là visual anchor.

Auto-arrange ưu tiên:

* giữ Goal ổn định;
* reflow contributors/path xung quanh Goal.

Goal không phải immutable position, nhưng không nên bị engine đẩy lung tung.

---

# 33. SELECTION MODEL

## Single

Click.

## Multi

```text
Ctrl + Click
```

toggle selected object.

## Marquee

Drag selection rectangle trên canvas.

## Branch

Select Branch action.

---

# 34. COPY / PASTE

Node Copy:

```text
Ctrl + C
Ctrl + V
```

Copy:

* main text;
* note;
* image;
* width;
* role;
* visual metadata.

Không copy external relationship.

---

# 35. DUPLICATE

```text
Ctrl + D
```

Duplicate Node gần source.

Single Node:

→ không duplicate relationships.

---

## 35.1 Multi-object duplicate

Nếu relation có cả hai endpoint trong selection:

→ duplicate relation.

Ví dụ selected:

```text
A → B → C
```

Duplicate:

```text
A' → B' → C'
```

Nếu:

```text
C → Goal
```

Goal nằm ngoài selection:

→ không tạo `C' → Goal`.

---

# 36. DELETE NODE

Delete một Node:

> chỉ delete Node đó, không delete downstream branch.

---

# 37. PATH AUTO-RECONNECT ON DELETE

Rule chỉ áp dụng PATH.

## 1 incoming + 1 outgoing

```text
A → X → C
```

Delete X:

```text
A → C
```

---

## N incoming + 1 outgoing

```text
A ─┐
   ├→ X → C
B ─┘
```

Delete X:

```text
A ─┐
   ├→ C
B ─┘
```

---

## 1 incoming + M outgoing

```text
      ┌→ C
A → X ┤
      └→ D
```

Delete X:

```text
A ─┬→ C
   └→ D
```

---

## N incoming + M outgoing

Nếu:

```text
N > 1
AND
M > 1
```

Delete action disabled.

Reason:

Spread không thể xác định reconnect intent an toàn.

---

# 38. RELATED / REFERENCE ON DELETE

Node bị delete:

→ RELATED liên quan delete theo.

→ REFERENCE liên quan delete theo.

Không auto-reconnect.

---

# 39. DELETE GOAL

Goal delete dùng cùng rule Node.

Không special case.

---

# 40. UNMARK GOAL

Unmark:

* role → NORMAL;
* relationships giữ;
* layout attachment giữ;
* text/image/note giữ;
* visual trở về Normal Node.

---

# 41. UNDO / REDO

Undo/Redo phải restore **semantic + visual state**.

Must cover:

* create Node;
* delete;
* delete + reconnect;
* relation create/delete;
* Reverse;
* branch drag;
* re-parent;
* auto-arrange;
* multi-select move;
* Goal mark/unmark;
* resize;
* text;
* note;
* image add/remove/replace;
* Seed create/delete;
* Seed shuffle;
* Seed → Node;
* Imagination image changes.

Branch drag/reparent phải là một atomic undo action.

---

# 42. IMAGINATION

## 42.1 Purpose

Imagination là:

> mini moodboard / visual reference board.

Nó không phải một planning step.

---

## 42.2 Images

Imagination:

* hỗ trợ nhiều ảnh;
* không hard-limit 6 ở data layer.

Canvas preview:

> tối đa 6 visual slots.

Additional images:

```text
+N
```

---

# 43. IMAGINATION LAYOUT

V1:

**automatic layout only**

User không free-position từng image.

Layout adaptive theo image count.

User có thể:

* reorder;
* replace;
* remove;
* add;
* open;
* resize whole Imagination.

---

# 44. IMAGINATION DETAIL

Double-click/Open:

→ show larger viewer/detail.

User có thể quản lý toàn bộ image set.

Canvas vẫn chỉ render summary preview.

---

# 45. IMAGINATION REFERENCE

One Imagination:

→ reference nhiều Node/Goal.

One Node/Goal:

→ được reference bởi nhiều Imagination.

```text
Imagination A ⇢ Goal
Imagination B ⇢ Goal
```

---

# 46. SEED BOX

## 46.1 Purpose

Seed Box là:

> low-structure container cho những thứ user muốn giữ trong map nhưng không muốn sắp xếp quá ngăn nắp.

Use cases:

* ideas;
* intentions;
* pending;
* maybe;
* possibilities;
* unsorted items;
* temporary holding;
* loose collections.

Seed không bắt buộc phải mature thành Node.

Có thể ở trong Box mãi.

---

# 47. SEED DATA

V1 Seed:

```text
Seed {
    id
    seedBoxId
    text

    visualSeed
    createdAt
    updatedAt
}
```

Không:

* image;
* notes;
* status;
* deadline;
* tags;
* PATH.

---

# 48. ADD SEED

Hover Seed Box:

→ `+`.

Click:

→ small creation popover.

User type.

`Enter`:

→ create.

`Esc`:

→ cancel.

Empty:

→ no creation.

---

# 49. SEED DROP ANIMATION

New Seed:

* enters từ phía trên;
* randomized horizontal starting position;
* gravity-like motion;
* settles toward bottom.

Animation phải:

* ngắn;
* responsive;
* respect reduced-motion setting.

---

# 50. SEED LAYOUT

Seed Box phải cảm giác:

> intentionally loose.

Không grid hoàn hảo.

Seed:

* random X;
* random Y settle;
* mild margin;
* slight randomized rotation;
* gravity toward bottom.

Rotation:

* typical khoảng ±5° đến ±15°;
* có thể có rare larger angle;
* absolute hard cap ≤35°.

Không được:

* overlap khiến text unreadable;
* nằm ngoài Box.

---

# 51. SEED SHUFFLE

Seed Box có action:

**Shuffle**

Hover/select Box:

```text
Shuffle
+
```

Shuffle:

* randomizes visual arrangement;
* does not change Seed semantic data;
* does not change text.

---

# 52. MOVING SEED BOX

Trong drag:

* Box + seeds move together;
* Seed arrangement không random liên tục mỗi pointer frame.

After drop:

→ Seed layout reshuffle nhẹ + gravity settle.

---

# 53. SEED BOX CAPACITY

Three size tiers:

```text
Small
≤10 seeds

Medium
≤20 seeds

Large
≤30 seeds
```

Maximum:

```text
30 Seeds
```

---

# 54. SIZE AUTO-PROMOTION

Adding Seed #11:

```text
Small → Medium
```

Seed #21:

```text
Medium → Large
```

User có thể chọn larger tier sớm hơn.

Không cho chọn tier nhỏ hơn current capacity.

At 30:

`+` disabled.

Tooltip:

```text
Maximum 30 seeds in this Seed Box.
```

---

# 55. SEED → NODE

Drag Seed ra khỏi Box.

## Drop empty canvas

→ create Normal Node.

→ no PATH.

→ Seed remove khỏi Box.

---

## Drop semantic graph slot

Preview:

* Node;
* relationship;
* layout.

Drop:

→ create Node + relationship.

---

## Cancel

→ Seed returns to Box.

---

## Undo

→ Node remove.

→ Seed restore vào original Seed Box.

---

# 56. MOVE SEED BETWEEN BOXES

Drag Seed Box A → Seed Box B.

If target capacity < 30:

→ move.

If full:

→ invalid drop.

---

# 57. NODE → SEED

V1:

**Không hỗ trợ automatic reverse conversion.**

Reason:

Node có thể có:

* relationship;
* Goal role;
* note;
* image;
* graph semantics.

Không silently discard data.

---

# 58. SEED BOX RELATIONSHIP

Seed item:

→ no relationships.

Seed Box:

→ `RELATED` only.

Not allowed:

* PATH;
* REFERENCE.

---

# 59. DELETE SEED

Delete:

→ immediate.

No confirmation.

Undo available.

---

# 60. DELETE SEED BOX

If empty:

→ delete immediately + Undo.

If has Seeds:

confirmation:

```text
Delete this Seed Box and its 14 seeds?
```

Cancel / Delete.

---

# 61. DUPLICATE SEED BOX

Duplicate:

* duplicate Box;
* duplicate Seed data;
* randomized layout regenerated.

Không clone exact visual coordinates.

---

# 62. FOCUS MODE

Focus available cho:

> any Node, including Goal.

Select Node → Focus.

---

# 63. FOCUS CONTENT

Focus highlights:

* all upstream PATH contributors;
* all downstream PATH that selected Node contributes toward.

Other graph:

→ dim.

Không hide hoàn toàn.

---

# 64. FOCUS PRESERVES CONTEXT

Focus:

* does not change layout;
* does not change relationships;
* does not auto-arrange.

Goal/Node remains in current position.

Spatial memory preserved.

---

# 65. RELATED / REFERENCE IN FOCUS

RELATED:

→ heavily de-emphasized.

REFERENCE:

→ lightly visible nếu trực tiếp liên quan.

PATH:

→ primary visual structure.

---

# 66. SEARCH

Shortcut:

```text
Ctrl + F
```

Search sources:

* Normal Node text;
* Goal text;
* Seed text;
* Seed Box title;
* Imagination title/note.

---

# 67. SEARCH RESULT ACTION

Select result:

1. pan/zoom canvas;
2. center object;
3. select object.

Không auto-enter Focus.

---

# 68. SEMANTIC ZOOM

Spread không auto-collapse branch.

Mọi Node vẫn tồn tại spatially.

Zoom level chỉ thay detail density.

---

## Near Zoom

Show:

* Node image;
* text;
* PATH;
* RELATED;
* REFERENCE.

---

## Medium Zoom

Can reduce:

* Normal Node image;
* secondary details;
* RELATED prominence;
* REFERENCE prominence.

---

## Far Zoom

Show primarily:

* PATH structure;
* compact Node identity;
* Goal identity.

Goal vẫn là landmark mạnh.

REFERENCE có thể hide.

RELATED có thể hide.

---

# 69. MINIMAP

V1:

No minimap by default.

Search + Fit + Focus + Semantic Zoom được ưu tiên.

---

# 70. CANVAS NAVIGATION

Must support:

* pan;
* zoom;
* pinch;
* wheel;
* Space + drag;
* middle mouse drag;
* Fit Graph;
* Fit Selection;
* reset zoom.

Exact shortcut mapping có thể điều chỉnh trong UX implementation.

---

# 71. UI ARCHITECTURE

Spread sử dụng 3 tầng interaction.

---

# 72. MAIN TOOLBAR

Chỉ global/common actions.

Recommended:

```text
Select
Hand/Pan
Create
Search
Fit View
```

Không đưa mọi object action lên main toolbar.

---

# 73. CONTEXTUAL TOOLBAR

Chỉ hiện khi object selected.

Maximum khoảng:

> 3 primary actions + More.

Normal Node:

```text
Image
Mark as Goal
Focus
More
```

Goal:

```text
Image
Unmark Goal
Focus
More
```

Seed Box:

```text
Add Seed
Shuffle
More
```

Imagination:

```text
Add Image
Open
More
```

Edge:

```text
Reverse
Type
Delete
```

---

# 74. RIGHT-SIDE PANEL

Dành cho:

* notes;
* deep properties;
* detailed content;
* image adjustment;
* future advanced metadata.

Không dùng panel cho quick actions.

Panel:

→ dismissible.

Close:

→ restore full canvas width.

---

# 75. CONTEXT MENU

Right-click là:

* fallback;
* power-user surface;
* advanced secondary actions.

Không giấu core action chỉ ở context menu.

---

# 76. UI PLACEMENT PRINCIPLE

> Frequency determines proximity.

Always-used:

→ canvas.

Frequent:

→ contextual toolbar.

Occasional:

→ More/context menu.

Deep:

→ side panel.

Global:

→ main toolbar.

---

# 77. AUTO SAVE

No primary Save button.

All changes:

1. update UI immediately;
2. update local state;
3. record undo;
4. persist locally/cache;
5. sync when appropriate.

Status:

```text
Saved
Saving…
Offline
Sync issue
```

Không block editing vì save request.

---

# 78. DATA FLOW

Example text edit:

```text
User input
↓
Local UI state
↓
Graph state
↓
Undo history
↓
Local persistence/cache
↓
Sync queue
↓
Server
```

No server roundtrip required for immediate interaction.

---

# 79. IMAGE DATA FLOW

Paste/drop:

```text
Input image
↓
Local preview
↓
Asset record
↓
Thumbnail processing
↓
Upload/storage
↓
Remote reference
```

UI phải show image ngay bằng local preview nếu có thể.

---

# 80. IMAGE FAILURE

Upload failure:

* keep local placeholder;
* show error state;
* Retry;
* Remove.

Không silently remove image user vừa add.

---

# 81. OFFLINE / INTERRUPTION

If network fails:

* continue editing;
* maintain local changes;
* queue sync.

Closing app:

→ changes must be recoverable.

Browser refresh:

→ restore persisted state as much as architecture supports.

---

# 82. OBJECT STATES

Generic states:

```text
default
hover
selected
editing
dragging
disabled
error
```

Seed Box adds:

```text
drop-target
full
```

Imagination adds:

```text
uploading
upload-error
```

Relationship adds:

```text
hover
selected
preview
invalid
```

---

# 83. GRAPH DATA MODEL

Recommended conceptual model:

```text
Map
CanvasObject
Node
SeedBox
Seed
Imagination
Asset
Relationship
LayoutAttachment
UndoOperation
```

---

# 84. CANVAS OBJECT BASE

```text
CanvasObject {
    id
    mapId
    type

    x
    y

    width
    height

    zIndex

    createdAt
    updatedAt
}
```

---

# 85. NODE MODEL

```text
Node {
    id
    mapId

    role:
      NORMAL
      GOAL

    text
    note?

    imageAssetId?

    width

    createdAt
    updatedAt
}
```

---

# 86. RELATIONSHIP MODEL

```text
Relationship {
    id
    mapId

    sourceId
    targetId

    type:
      PATH
      RELATED
      REFERENCE

    createdAt
    updatedAt
}
```

---

# 87. LAYOUT ATTACHMENT

Internal-only.

```text
LayoutAttachment {
    nodeId
    relationshipId?
}
```

Purpose:

* determine structural attachment;
* predictive re-parent;
* auto-arrange.

Không expose terminology này cho user.

---

# 88. IMAGINATION MODEL

```text
Imagination {
    id
    mapId

    title?
    note?

    width
    height

    imageAssetIds[]

    createdAt
    updatedAt
}
```

---

# 89. SEED BOX MODEL

```text
SeedBox {
    id
    mapId

    title

    sizeTier:
      SMALL
      MEDIUM
      LARGE

    visualShuffleSeed

    createdAt
    updatedAt
}
```

---

# 90. SEED MODEL

```text
Seed {
    id
    seedBoxId

    text

    visualSeed

    createdAt
    updatedAt
}
```

---

# 91. ASSET MODEL

```text
Asset {
    id

    mimeType
    filename

    width
    height
    fileSize

    localState?
    storageUrl?
    thumbnailUrl?

    uploadStatus

    createdAt
}
```

---

# 92. DATA INTEGRITY

Không được tồn tại:

```text
Relationship → deleted object

Seed → missing SeedBox

Node.image → missing Asset

Imagination.image → missing Asset
```

Cleanup hoặc reference integrity bắt buộc.

---

# 93. DELETE / ASSET CLEANUP

Deleting Node/Imagination:

Không nhất thiết hard-delete underlying asset ngay nếu asset còn được reference.

Asset cleanup cần reference-aware.

---

# 94. PERFORMANCE REQUIREMENTS

Core requirement:

> Dragging must feel direct.

Target:

* 60 FPS trong normal drag interaction;
* pointer response perceived instant;
* no API call per pointer move.

---

# 95. AUTO-ARRANGE PERFORMANCE

Predictive reflow phải:

* update realtime;
* operate local/branch scope;
* avoid full graph recalculation nếu không cần.

Large graph algorithms phải incremental nếu architecture cho phép.

---

# 96. LOAD PERFORMANCE

Normal cached map:

target perceived load:

> ~1 second or better.

Large/image-heavy map:

→ progressive hydration/render.

Không blank canvas lâu.

---

# 97. LARGE GRAPH TARGET

Initial engineering target:

* 100–500 Nodes usable;
* many edges;
* multiple Imagination/Seed Boxes.

Architecture không nên hard-code assumption map <100 Nodes.

---

# 98. IMAGE PERFORMANCE

Canvas không render full-resolution images nếu không cần.

Use:

* thumbnail;
* appropriate image size;
* lazy loading;
* decoded image cache.

---

# 99. ANIMATION PRINCIPLES

Animation phải:

* explain state;
* reinforce physical metaphor;
* improve predictability.

Không decorative animation liên tục.

Examples có purpose:

* Node placement preview;
* branch reflow;
* Seed fall;
* Seed shuffle settle;
* image morph;
* Goal role morph.

---

# 100. ACCESSIBILITY / REDUCED MOTION

Reduced motion:

* disable/reduce Seed physics animation;
* simplify reflow animation;
* maintain clear final state.

Keyboard operation phải được hỗ trợ cho các action chính.

---

# 101. MVP V1 — MUST HAVE

## Canvas

* infinite canvas;
* zoom/pan;
* fit;
* selection;
* multi-selection;
* semantic zoom.

## Graph

* Normal Node;
* Goal role;
* PATH;
* RELATED;
* REFERENCE;
* branch creation;
* relation add/delete/reverse;
* no PATH cycles.

## Layout

* predictive drag;
* branch drag;
* shared downstream drag;
* re-parent;
* layout attachment;
* branch-level auto-reflow.

## Node

* inline text;
* note;
* 1 image;
* hybrid resize;
* Mark/Unmark Goal;
* copy/duplicate/delete;
* undo/redo.

## Goal

* direct creation;
* visual prominence;
* hero image;
* contributor behavior from `+`.

## Imagination

* multi-image;
* 6-slot preview;
* +N;
* auto layout;
* reorder;
* resize;
* REFERENCE.

## Seed Box

* add Seed;
* Seed physics;
* shuffle;
* 3 capacity tiers;
* max 30;
* drag Seed → Node;
* RELATED only.

## Navigation

* Focus;
* Search;
* Fit Selection.

---

# 102. OUT OF SCOPE V1

Không đưa vào V1:

* tasks;
* status;
* progress;
* due dates;
* calendar;
* timeline;
* collaboration;
* realtime cursors;
* comments;
* AI;
* advanced tags;
* custom Node types;
* additional relation types;
* freeform Imagination image placement;
* global auto-layout;
* auto branch collapse;
* presentation mode;
* version-history UI;
* minimap default;
* Node → Seed automatic conversion.

---

# 103. CORE FEATURE INPUT / OUTPUT / DATA MATRIX

| Feature               | Entry Point               | Input                  | Output           | Stored Data          | Undo         | Failure/Interrupt          |
| --------------------- | ------------------------- | ---------------------- | ---------------- | -------------------- | ------------ | -------------------------- |
| Create Node           | + / Create / double-click | text                   | Node             | Node                 | Yes          | empty → cancel             |
| Create Goal           | Create / Mark as Goal     | text                   | Goal             | Node.role            | Yes          | none                       |
| Add Node Image        | paste/drop/Image          | image                  | thumbnail/hero   | Asset + node ref     | Yes          | retry/remove               |
| Add PATH              | + / Connect               | source,target          | arrow            | Relationship         | Yes          | reject cycle               |
| Reverse PATH          | edge toolbar              | Relationship           | reversed arrow   | Relationship         | Yes          | reject if cycle            |
| Delete Relation       | edge                      | Relationship ID        | no edge          | delete relationship  | Yes          | none                       |
| Drag Branch           | drag                      | position               | moved branch     | layout metadata      | Yes          | invalid slot → no commit   |
| Re-parent             | semantic drop             | source branch + target | new attachment   | relationship/layout  | Yes          | invalid cycle              |
| Add Seed              | Seed Box +                | text                   | Seed             | Seed                 | Yes          | empty cancel               |
| Shuffle Seeds         | Seed Box action           | none                   | new arrangement  | visual seed          | Yes/optional | none                       |
| Seed → Node           | drag                      | Seed                   | Node             | Node + delete Seed   | Yes          | invalid drop returns       |
| Add Imagination Image | paste/drop                | image                  | image preview    | Asset                | Yes          | retry/remove               |
| Focus                 | Node action               | Node ID                | visual emphasis  | UI state only        | n/a          | none                       |
| Search                | Ctrl+F                    | query                  | object selection | none                 | n/a          | no results                 |
| Delete Node           | Delete                    | Node                   | reconnect graph  | Node + relationships | Yes          | disabled on ambiguous PATH |

---

# 104. EXCEPTION RULES

## Self relation

Not allowed.

## Duplicate relation

Not allowed.

## PATH cycle

Not allowed.

## PATH + RELATED same pair

Not allowed simultaneously.

## Imagination PATH

Not allowed.

## Seed PATH

Not allowed.

## Seed Box PATH

Not allowed.

## Seed Box full

30 max.

## Delete ambiguous Node

If:

```text
incoming PATH > 1
AND
outgoing PATH > 1
```

Delete disabled.

## Upload failure

Local placeholder remains.

## Invalid drag

No commit.

## Empty create

Temporary object removed.

---

# 105. USER FLOW — GOAL-FIRST

```text
Open Map
↓
Create Goal
↓
Goal appears as visual anchor
↓
click +
↓
Create Contributor
↓
Contributor → Goal
↓
continue branching outward
↓
add images / Imagination
↓
add RELATED context
↓
Focus Goal when graph grows
```

---

# 106. USER FLOW — DISCOVERY-FIRST

```text
Open Map
↓
Create Normal Nodes / Seed Box / Imagination
↓
collect thoughts + visuals
↓
connect relevant Nodes
↓
develop branches
↓
recognize meaningful destination
↓
Mark as Goal
↓
continue PATH
↓
Focus / Search when needed
```

---

# 107. USER FLOW — SEED BOX

```text
Create Seed Box
↓
hover +
↓
type Seed
↓
Seed drops into box
↓
Seed stays loose
├─ leave indefinitely
├─ shuffle
├─ move to another Box
├─ delete
└─ drag out → Node
```

---

# 108. USER FLOW — IMAGINATION

```text
Create Imagination
↓
paste/drop images
↓
Spread auto-layouts images
↓
reorder / resize
↓
connect via REFERENCE
↓
use as visual context for Node/Goal
```

---

# 109. USER FLOW — RESTRUCTURE GRAPH

```text
Pick up Node
↓
all downstream PATH follows
↓
hover candidate branch slot
↓
Spread previews final graph
↓
branch-level reflow preview
↓
drop
↓
layout attachment changes
↓
relationships outside changed attachment remain
↓
Undo available
```

---

# 110. UX QUALITY TEST

Mỗi feature trước khi ship phải qua:

## Interaction Test

> Một user mới có thể đoán cách thực hiện thao tác trong khoảng 5–10 giây không?

Nếu không:

→ entry point cần redesign.

---

## Readability Test

> Graph 30–50 object có thể hiểu structure trong vài giây không?

Nếu không:

→ visualization/layout phải redesign.

---

# 111. DEFINITION OF DONE — FEATURE

Một feature không được coi là đã spec/implement xong nếu chưa xác định:

```text
Purpose
Entry Point
Input
Interaction
Output
Persisted Data
Loading
Empty State
Error State
Invalid State
Delete Behavior
Undo Behavior
Keyboard Behavior
Relationship Impact
Layout Impact
Offline/Interruption Behavior
```

---

# 112. PRODUCT GUARDRAIL

Mỗi feature mới phải trả lời:

> Có trực tiếp giúp user thiết kế, hình dung hoặc bám theo Vision Graph không?

Nếu không:

→ không mặc định đưa vào Spread.

---

# 113. FEATURE COMPLETENESS PRINCIPLE

Spread không cố:

> có tất cả feature mà competitor có.

Spread cố:

> có đầy đủ những capability cần thiết cho core job của Spread.

Do đó:

**Feature completeness ≠ Feature quantity.**

---

# 114. FINAL PRODUCT MODEL

Spread có bốn object semantic chính:

```text
NODE
A structured point in the plan.

GOAL
A visually important Node that acts as an anchor.

SEED BOX
An intentionally loose collection of ideas / intentions / pending items.

IMAGINATION
A visual collection / mini moodboard.
```

Và ba relationship:

```text
PATH
A contributes toward B.

RELATED
A is contextually related to B.

REFERENCE
Imagination visually references a Node/Goal.
```

---

# 115. CORE SPREAD EXPERIENCE

Trải nghiệm lý tưởng:

```text
Start somewhere
↓
Spread outward
↓
Capture loose things when needed
↓
Add visual imagination
↓
Connect meaningful points
↓
Discover / define Goals
↓
Rearrange paths naturally
↓
Focus when complexity grows
↓
Always understand where things lead
```

Spread không bắt user phải hoàn thiện cấu trúc ngay.

Nhưng khi structure xuất hiện:

> Spread phải giúp structure đó luôn đẹp, rõ và dễ bám theo.

---

# 116. SUCCESS CRITERIA FOR V1

V1 thành công nếu user có thể:

1. mở app và bắt đầu tạo graph mà gần như không cần tutorial;
2. tạo branch nhanh bằng `+`;
3. kéo/restructure graph mà nhìn thấy trước kết quả;
4. tạo graph many-to-many nhưng vẫn đọc được;
5. dùng Goal như visual anchor mà không cảm giác đang dùng task manager;
6. kết hợp text + image + moodboard tự nhiên;
7. giữ những thứ chưa muốn organize trong Seed Box;
8. quay lại một graph sau thời gian dài và vẫn hiểu cấu trúc;
9. thao tác drag/pan/zoom mượt;
10. cảm nhận Spread là một product được thiết kế rất có chủ đích, không phải một generic graph editor.
