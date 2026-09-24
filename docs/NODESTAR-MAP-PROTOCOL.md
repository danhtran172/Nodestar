# NODESTAR MAP INTERCHANGE PROTOCOL

## NMIP — Nodestar Map Interchange Protocol V1

**Document status:** Normative protocol spec — V1
**Scope:** Định dạng file, quy tắc mã hoá, bất biến đồ thị, quy trình validate, quy ước phiên bản cho việc **export / import một MAP** ra khỏi và vào lại workspace Nodestar.
**Companion:** [NODESTAR-V1.md](NODESTAR-V1.md) (product spec). Tài liệu này chỉ nói về *dữ liệu trên đường truyền*, không nói về hành vi UI.

---

# 0. CONVENTIONS

Các từ khoá **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** được hiểu theo RFC 2119.

Trong tài liệu này:

* **Writer** = bên tạo ra file (Nodestar export, script, công cụ bên thứ ba).
* **Reader** = bên đọc file (Nodestar import, validator, migration tool).
* **Document** = một file NMIP hoàn chỉnh.
* **Map** = một `VisionMap` — một đồ thị Nodestar duy nhất.

---

# 1. FILE IDENTITY

| Thuộc tính | Giá trị |
| --- | --- |
| Encoding | UTF-8, **MUST NOT** có BOM |
| Cú pháp | JSON (RFC 8259). **MUST NOT** dùng JSON5, comment, trailing comma |
| Đuôi file | `.nodestar.json` |
| Media type | `application/json` (đang dùng). `application/vnd.nodestar.map+json` là tên đăng ký dự kiến — reader **SHOULD** chấp nhận cả hai |
| Đuôi legacy | `.spread.json` — reader **MUST** chấp nhận, writer **MUST NOT** tạo mới |

## 1.1 Quy tắc đặt tên file

Writer **SHOULD** sinh tên file từ `map.title`:

```
sanitize(title) = title.replace(/[^a-z0-9 -]/gi, '').trim()
filename        = (sanitize(title) || 'nodestar') + '.nodestar.json'
```

Tên file **không mang ngữ nghĩa**. Reader **MUST NOT** suy luận bất cứ điều gì từ tên file; mọi thông tin phải nằm trong nội dung.

## 1.2 Không nén, không nhị phân

V1 là một file JSON phẳng, self-contained. Ảnh được nhúng dưới dạng data URL (§6). Không sidecar, không zip, không tham chiếu ra ngoài file. Một Document **MUST** khôi phục được đầy đủ trên một thiết bị offline chưa từng thấy workspace gốc.

---

# 2. ENVELOPE

Tầng ngoài cùng của Document là **backup envelope**:

```jsonc
{
  "nodestarBackup": 1,
  "map":    { /* §3 VisionMap */ },
  "assets": { /* §6 assetId -> Asset */ }
}
```

| Khoá | Kiểu | Bắt buộc | Quy tắc |
| --- | --- | --- | --- |
| `nodestarBackup` | `1` | MUST | Envelope version. V1 chỉ chấp nhận đúng số nguyên `1` |
| `spreadBackup` | `1` | — | **Alias legacy.** Reader **MUST** chấp nhận khi `nodestarBackup` vắng mặt. Writer **MUST NOT** ghi |
| `map` | object | MUST | Đúng một map (§3) |
| `assets` | object | SHOULD | Bảng tra `assetId → Asset`. **MUST** có mặt nếu map tham chiếu bất kỳ ảnh nào. `{}` hoặc vắng mặt là hợp lệ khi map không có ảnh |

**Quy tắc mở rộng:** Reader **MUST** bỏ qua mọi khoá lạ ở tầng envelope thay vì báo lỗi. Đây là cơ chế forward-compatibility duy nhất của V1: một writer tương lai có thể thêm metadata mà không phá vỡ reader cũ.

**Envelope version nằm riêng với map version.** `nodestarBackup` mô tả *cách đóng gói*; `map.version` mô tả *hình dạng đồ thị*. Hai con số tiến độc lập.

## 2.1 Những gì envelope V1 KHÔNG mang

Các thứ sau là **trạng thái workspace**, không phải trạng thái map, và cố tình nằm ngoài Document:

* `viewport` (pan/zoom) — thuộc về catalog entry trên thiết bị.
* Catalog nhiều map, cờ `archived`, `activeId`.
* Lịch sử undo, selection, focus.
* `revision` / `savedAt` của workspace snapshot — đó là lớp persistence nội bộ, không phải giao thức trao đổi.

Reader **MUST** tự khởi tạo các giá trị này khi import.

---

# 3. MAP OBJECT

```jsonc
{
  "version": 1,
  "title": "My next chapter",
  "anchorId": "b0c2…",
  "objects": [ /* §4 */ ],
  "relationships": [ /* §5 */ ]
}
```

| Trường | Kiểu | Bắt buộc | Quy tắc |
| --- | --- | --- | --- |
| `version` | `1` | MUST | **MUST** bằng đúng `1`. Giá trị khác ⇒ từ chối |
| `title` | string | MUST | Có thể rỗng. Không giới hạn độ dài ở tầng giao thức |
| `anchorId` | string | MUST | Neo không gian. Rỗng `""` = map chưa có neo (hợp lệ, dùng cho map rỗng). Nếu khác rỗng **MUST** trỏ tới một object tồn tại |
| `objects` | array | MUST | Có thể rỗng. Thứ tự **không** mang ngữ nghĩa z-order |
| `relationships` | array | MUST | Có thể rỗng |

---

# 4. CANVAS OBJECT

## 4.1 Trường

| Trường | Kiểu | Bắt buộc | Ràng buộc |
| --- | --- | --- | --- |
| `id` | string | MUST | Khác rỗng, **duy nhất trong map**. Writer **SHOULD** dùng UUIDv4 |
| `type` | enum | MUST | `NODE` \| `SEED_BOX` \| `IMAGINATION` \| `GRAPH` |
| `role` | enum | MUST | `NORMAL` \| `GOAL`. Chỉ `NODE` được phép `GOAL` |
| `text` | string | MUST | Tiêu đề. Có thể rỗng |
| `note` | string | MUST | Ghi chú dài. Có thể rỗng |
| `x`, `y` | number | MUST | Hữu hạn. Toạ độ world, không phải screen |
| `width` | number | MUST | Hữu hạn, `100 ≤ width ≤ 10000` |
| `height` | number | MUST | Hữu hạn, `height ≥ 1` |
| `images` | string[] | MUST | Các asset id. **Không trùng lặp** trong cùng một object. Xem §4.2 |
| `seeds` | Seed[] | MUST | Tối đa 30 phần tử. Xem §4.3 |
| `tier` | number | MUST | **MUST** ∈ `{10, 20, 30}` — *cho mọi kiểu object*, không riêng Seed Box. Object không phải Seed Box **SHOULD** ghi `10` |
| `shuffle` | number | MUST | Hữu hạn. Hạt giống ngẫu nhiên cho bố cục chip, thường ∈ [0,1) |
| `focal` | number | MUST | Hữu hạn. Điểm cắt ảnh theo chiều dọc, **SHOULD** ∈ [0,100] |
| `createdAt` | number | MUST | Epoch ms, hữu hạn |
| `updatedAt` | number | MUST | Epoch ms, hữu hạn |
| `focalX` | number | MAY | Điểm cắt ngang. Vắng mặt ⇒ map tạo trước khi có crop ngang |
| `displayNote` | boolean | MAY | Hiện note ngay trên card |
| `displayTitle` | boolean | MAY | Giữ tiêu đề Seed Box / Imagination hiện dưới card |
| `manualHeight` | boolean | MAY | Đánh dấu chiều cao do người dùng kéo |
| `collapsed` | boolean | MAY | Gập mọi thứ treo sau object này |
| `imaginationPreset` | enum | MAY | `small` \| `medium` \| `large` |
| `imaginationLayout` | enum | MAY | `collage` \| `uniform` \| `gapless` \| `spaced`. Hai giá trị sau là legacy nhưng hợp lệ vĩnh viễn |
| `attachment` | string | MAY | Id của PATH edge mà object này treo vào. Xem §5.4 |
| `mapRef` | string | MAY | Id catalog entry của map được liên kết. Xem §7 |

**Trường optional vắng mặt và trường optional bằng `undefined` là tương đương.** Writer **SHOULD** bỏ hẳn trường thay vì ghi `null`. Reader **MUST** coi `null` ở một trường optional là lỗi — `null` không lọt qua các kiểm tra kiểu.

## 4.2 Ràng buộc nội dung theo kiểu

Đây là các bất biến cứng. Vi phạm ⇒ **MUST** từ chối toàn bộ Document.

| Kiểu | `images` | `seeds` | `role` | `mapRef` |
| --- | --- | --- | --- | --- |
| `NODE` | 0 hoặc 1 | **MUST** rỗng | `NORMAL` hoặc `GOAL` | **MUST NOT** có |
| `SEED_BOX` | **MUST** rỗng | 0…30 | **MUST** `NORMAL` | **MUST NOT** có |
| `IMAGINATION` | 0…n | **MUST** rỗng | **MUST** `NORMAL` | **MUST NOT** có |
| `GRAPH` | **MUST** rỗng | **MUST** rỗng | **MUST** `NORMAL` | **MUST** có, khác rỗng |

Quan hệ giữa `type === 'GRAPH'` và `mapRef` khác rỗng là **tương đương hai chiều** — lệch một bên là lỗi: một Graph không có liên kết thì không đại diện cho gì cả, còn một object không phải Graph mang `mapRef` là dữ liệu rác.

## 4.3 Seed

```jsonc
{ "id": "…", "text": "Learn ceramics", "visualSeed": 0.42 }
```

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| `id` | string | Khác rỗng. **Duy nhất trên toàn map**, không chỉ trong Seed Box chứa nó |
| `text` | string | **MUST NOT** rỗng sau khi `trim()` |
| `visualSeed` | number | Hữu hạn |

Một Seed Box **MUST NOT** chứa quá 30 seed. `tier` là *sức chứa hiển thị*, không phải nguồn sự thật thứ hai cho số lượng seed; reader **MUST NOT** cắt bớt `seeds` theo `tier`.

---

# 5. RELATIONSHIP

```jsonc
{ "id": "…", "sourceId": "…", "targetId": "…", "type": "PATH" }
```

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| `id` | string | Khác rỗng, duy nhất trong map |
| `sourceId` | string | **MUST** trỏ tới object tồn tại |
| `targetId` | string | **MUST** trỏ tới object tồn tại |
| `type` | enum | `PATH` \| `RELATED` \| `REFERENCE` |

## 5.1 Kiểu quan hệ được suy ra từ hai đầu

Khi writer cần chọn `type`, luật là:

```
có IMAGINATION ở bất kỳ đầu nào  → REFERENCE
ngược lại, có SEED_BOX           → RELATED
ngược lại                        → PATH
```

`NODE` và `GRAPH` đều **path-carrying**: trong phạm vi một map, một Graph hành xử đúng như node mà nó đại diện.

## 5.2 Bất biến cạnh

Một Document **MUST** thoả toàn bộ:

1. **Không self-loop** — `sourceId !== targetId`.
2. **Không trùng cặp** — với mọi cặp object tồn tại tối đa **một** quan hệ, *không phân biệt chiều*. `A→B` và `B→A` cùng tồn tại là lỗi.
3. **PATH chỉ nối path-carrying** — cả hai đầu **MUST** là `NODE` hoặc `GRAPH`.
4. **PATH phi chu trình** — tập cạnh PATH **MUST** tạo thành DAG. Một cạnh tạo chu trình ⇒ từ chối.
5. **REFERENCE phải có đúng một đầu Imagination**, đầu còn lại path-carrying.
6. **RELATED MUST NOT chạm Imagination.**

## 5.3 Chiều của cạnh

`PATH` là cạnh có hướng và chiều **mang ngữ nghĩa**:

> `sourceId` là đầu **upstream** (thứ đóng góp / dẫn tới), `targetId` là đầu **downstream** (thứ được dẫn tới).

Path chảy *về phía* đích, nên một node phụ trợ nối tới một GOAL được ghi là `source = node`, `target = goal`. Mọi phép duyệt nhánh đi theo chiều `source → target`.

* `PATH`: chiều **MUST** được giữ nguyên khi export/import. Đảo chiều là đổi ý nghĩa của map.
* `REFERENCE`: chiều chuẩn tắc là **Imagination → object path-carrying**. Writer **MUST** ghi theo chiều này. Reader **SHOULD** chấp nhận chiều ngược lại và chuẩn hoá khi nạp.
* `RELATED`: không định hướng về ngữ nghĩa; chiều được giữ nguyên nhưng không được diễn giải.

## 5.4 Branch attachment

`object.attachment` ghim object vào PATH edge mà nó treo lên, để reflow nhánh biết đâu là cạnh xương sống.

Nếu `attachment` có mặt và khác rỗng, nó **MUST** thoả cả ba:

* tồn tại một relationship có `id === attachment`;
* relationship đó có `type === 'PATH'`;
* và `targetId === object.id` — tức object này là **đầu downstream** của cạnh.

Attachment treo lơ lửng ⇒ Document không hợp lệ và **không nạp được**. Writer **SHOULD** bỏ hẳn trường thay vì trỏ tới cạnh đã xoá.

---

# 6. ASSETS

`assets` là bảng tra `assetId → Asset`, **không phải mảng**.

```jsonc
"assets": {
  "9f1c…": {
    "id": "9f1c…",
    "filename": "studio.jpg",
    "mimeType": "image/jpeg",
    "width": 3024,
    "height": 4032,
    "preview": "data:image/webp;base64,…",
    "full": "data:image/jpeg;base64,…",
    "status": "saved"
  }
}
```

| Trường | Kiểu | Bắt buộc | Quy tắc |
| --- | --- | --- | --- |
| `id` | string | MUST | **MUST** khớp với khoá của nó trong `assets` |
| `filename` | string | MUST | Chỉ để hiển thị. Không dùng để truy xuất |
| `mimeType` | string | MUST | MIME gốc của ảnh người dùng chọn |
| `width`, `height` | number | MUST | Kích thước **tự nhiên** của ảnh gốc, tính bằng pixel |
| `preview` | string | MUST | Data URL, **MUST** bắt đầu bằng `data:image/`. Cạnh dài ≤ 900px, WebP chất lượng ~0.83 |
| `full` | string | MUST | Data URL ảnh gốc, nguyên vẹn |
| `status` | enum | SHOULD | `saved` \| `error`. Reader **MUST** ghi đè thành `saved` khi nạp |
| `error` | string | MAY | Chỉ có ý nghĩa cục bộ. Reader **MUST** loại bỏ khi nạp |

## 6.1 Toàn vẹn tham chiếu

Với **mọi** `assetId` xuất hiện trong `object.images` của bất kỳ object nào:

* `assets[assetId]` **MUST** tồn tại;
* `assets[assetId].preview` **MUST** là chuỗi bắt đầu bằng `data:image/`.

Thiếu một ảnh ⇒ **MUST** từ chối toàn bộ Document. Import là thao tác **all-or-nothing**: không có chế độ nạp một phần, không có placeholder ảnh hỏng.

## 6.2 Cắt tỉa khi export

Writer **MUST** chỉ ghi những asset thực sự được map tham chiếu:

```
used   = ∪ { o.images | o ∈ map.objects }
assets = { id: asset | id ∈ used }
```

Asset mồ côi — có trong `assets` nhưng không object nào dùng — **MUST NOT** được ghi. Reader **SHOULD** chấp nhận và bỏ qua nếu gặp, vì chúng vô hại.

## 6.3 Kích thước

* Ảnh nguồn > **30 MB** **MUST** bị từ chối ngay ở bước tạo asset.
* Giao thức không đặt trần cho kích thước Document. Vì ảnh là base64 (bloat ~33%), một map nhiều Imagination có thể tạo ra file vài trăm MB. Writer **SHOULD** cảnh báo người dùng; reader **SHOULD** xử lý bất đồng bộ.

---

# 7. CROSS-MAP REFERENCES (GRAPH)

Một object `GRAPH` mang `mapRef` — id của một **catalog entry** trong workspace nguồn. Map được liên kết sở hữu object của riêng nó; object Graph chỉ hiển thị central goal của map kia.

**V1 là giao thức một-map.** `mapRef` là id cục bộ của workspace nguồn và gần như chắc chắn **không** phân giải được ở workspace đích.

Quy tắc:

* Writer **MUST** giữ nguyên `mapRef` — xoá nó sẽ làm object Graph vi phạm §4.2.
* Writer **MUST NOT** nhúng map được liên kết vào Document V1.
* Reader **MUST** import thành công dù `mapRef` treo lơ lửng. Object Graph vẫn hiện diện, vẫn giữ vị trí và các cạnh của nó; chỉ thao tác "mở graph" là thất bại, với thông báo cho biết graph đó không có trong workspace này.
* Reader **MUST NOT** tự tạo map rỗng để lấp chỗ trống.

Đóng gói nhiều map trong một Document là việc của một envelope version tương lai (§10.3).

---

# 8. CLIPBOARD SUB-PROTOCOL

Copy/paste giữa các cửa sổ Nodestar dùng một biến thể rút gọn, truyền qua `text/plain` của clipboard.

```jsonc
{ "nodestarSelection": { /* VisionMap §3 */ } }
```

| Quy tắc | |
| --- | --- |
| Payload | Một `VisionMap` đầy đủ, hợp lệ theo §3–§5, chứa các object được chọn và các cạnh nằm hoàn toàn bên trong tập chọn |
| Alias legacy | `spreadSelection` — reader **MUST** chấp nhận, writer **MUST NOT** ghi |
| Ảnh | **KHÔNG** kèm theo. Selection chỉ tham chiếu asset id |
| Hệ quả | Paste một selection có ảnh sang workspace khác **MUST** thất bại, với thông báo hướng người dùng sang đường backup file |
| Id | Reader **MUST** cấp id mới cho mọi object, seed và cạnh khi paste — paste là *nhân bản*, không phải *khôi phục* |
| Anchor | `anchorId` trong selection chỉ là gợi ý; reader **MUST** ánh xạ nó sang id mới hoặc bỏ rỗng |
| Thất bại | JSON hỏng hoặc sai hình dạng **MUST** rơi về clipboard nội bộ của phiên, im lặng |

Khi clipboard chứa **file ảnh**, nhánh ảnh thắng và nhánh JSON không được xét.

---

# 9. VALIDATION PIPELINE

Reader **MUST** chạy đúng thứ tự sau. Mỗi bước thất bại ⇒ dừng, **không ghi gì**, báo lỗi cho người dùng.

| # | Bước | Thất bại nghĩa là |
| --- | --- | --- |
| 1 | Parse JSON | File không phải JSON |
| 2 | `nodestarBackup ?? spreadBackup === 1` | Không phải file backup Nodestar |
| 3 | `map.version === 1`, `objects` & `relationships` là mảng | Envelope đúng nhưng ruột sai |
| 4 | Validate map (§3–§5) | Đồ thị vi phạm bất biến |
| 5 | Toàn vẹn ảnh (§6.1) | Backup thiếu ảnh |
| 6 | Ghi atomically — assets + map trong một transaction | Thiết bị không lưu được |
| 7 | Cập nhật state, reset selection/focus/detail, fit viewport | — |

## 9.1 Thứ tự kiểm tra bên trong bước 4

1. Hình dạng map (§3).
2. Từng object: kiểu trường, enum, khoảng số, tính duy nhất của `id` (§4.1).
3. Ràng buộc nội dung theo kiểu (§4.2).
4. `tier` ∈ {10,20,30}.
5. Từng seed, với tính duy nhất id trên toàn map (§4.3).
6. Từng relationship: hình dạng, id duy nhất, rồi **phát lại** qua thủ tục connect để ép các bất biến §5.2. Phép phát lại diễn ra trên một bản sao dùng-một-lần; **id cạnh trong Document được giữ nguyên**.
7. Branch attachment (§5.4).
8. `anchorId` phân giải được (§3).

## 9.2 Thông báo lỗi chuẩn

Reader **SHOULD** phát đúng các chuỗi sau — chúng là một phần hợp đồng với người dùng:

| Tình huống | Thông báo |
| --- | --- |
| Envelope sai | `Choose a Nodestar backup file.` |
| Hình dạng map sai | `Choose a valid Nodestar map.` |
| Object sai | `This map contains an invalid object.` |
| Vi phạm nội dung theo kiểu | `This map violates object content rules.` |
| `tier` sai | `This Seed Box has an invalid capacity.` |
| Seed sai | `This map contains an invalid seed.` |
| Relationship sai | `This map contains an invalid relationship.` |
| Attachment treo | `This map contains an invalid branch attachment.` |
| Anchor treo | `This map is missing its spatial anchor.` |
| Thiếu ảnh | `This backup is missing an image.` |
| Không ghi được | `The backup could not be saved on this device.` |
| Thành công | `Backup restored. Undo is available.` |

## 9.3 Ngữ nghĩa import

* Import **MUST** thay thế map đang mở, **không** merge.
* Import **MUST** đi qua cùng cơ chế commit như mọi chỉnh sửa khác, nên nó **MUST** undo được.
* Import **MUST NOT** cấp id mới. Khác với paste, restore phải giữ nguyên danh tính để một file có thể được khôi phục nhiều lần mà vẫn hội tụ về cùng một đồ thị.
* Ghi asset và ghi map **MUST** nằm trong cùng một transaction. Không bao giờ được tồn tại trạng thái "map đã vào, ảnh chưa vào".

---

# 10. VERSIONING

## 10.1 Hai con số

| Con số | Ý nghĩa | Tăng khi |
| --- | --- | --- |
| `nodestarBackup` | Bố cục envelope | Thay đổi cấu trúc *bên ngoài* map: nhiều map, sidecar, nén |
| `map.version` | Hình dạng đồ thị | Thay đổi phá vỡ trong object / relationship / seed |

## 10.2 Thay đổi nào cần tăng version

**KHÔNG cần tăng** — tương thích ngược, reader cũ vẫn đọc được:

* Thêm một trường **optional** vào object.
* Thêm khoá mới ở tầng envelope.
* Siết validator cho một trường mà mọi file do Nodestar sinh ra vốn đã thoả (§11).

**CẦN tăng:**

* Thêm trường bắt buộc.
* Đổi tên hoặc xoá bất kỳ trường nào.
* Thu hẹp một khoảng giá trị hoặc một enum.
* Thay đổi ngữ nghĩa chiều cạnh.
* Thêm một `Kind` hoặc `RelationType` mới.
* Thêm một giá trị vào enum sẵn có (`imaginationLayout`, `imaginationPreset`): reader cũ sẽ từ chối cả file, nên đây là thay đổi phá vỡ chứ không phải mở rộng.

## 10.3 Dự kiến cho V2 — chưa triển khai, writer MUST NOT ghi

Các khoá sau được **dành riêng**. Reader V1 bỏ qua chúng an toàn theo §2.

| Khoá | Mục đích dự kiến |
| --- | --- |
| `meta.exportedAt` | Epoch ms lúc export |
| `meta.producer` | Tên + phiên bản app đã ghi file |
| `meta.profile` | URI profile giao thức |
| `maps` | Mảng nhiều map, cho phép `mapRef` phân giải được trong nội bộ file |
| `viewport` | Pan/zoom kèm theo map |

## 10.4 Giá trị legacy không bao giờ chết

Các giá trị dưới đây do một phiên bản cũ ghi ra và **MUST** hợp lệ vĩnh viễn:

* `imaginationLayout: 'gapless' | 'spaced'` — do phiên bản đầu tiên có chuyển layout ghi.
* `object.focalX` vắng mặt — map tạo trước khi có crop ngang.
* Envelope `spreadBackup`, clipboard `spreadSelection`, đuôi `.spread.json` — sản phẩm từng mang tên SPREAD.
* Object hợp lệ nhưng thiếu các cờ optional — coi như `false`.

Quy tắc chung: **đổi tên không phải là cái cớ để làm mất dữ liệu.**

---

# 11. KNOWN GAPS

Ba trường hiện **không** được validator ép kiểu. Ghi ra đây để chúng không bị coi là bỏ sót, và để việc siết lại sau này là một thay đổi có chủ đích chứ không phải sửa lỗi ngẫu nhiên:

| Trường | Trạng thái | Yêu cầu của giao thức |
| --- | --- | --- |
| `imaginationPreset` | Không kiểm tra | Writer **MUST** chỉ ghi `small` \| `medium` \| `large` |
| `displayNote` | Không kiểm tra | Writer **MUST** chỉ ghi boolean |
| `focal` / `focalX` | Chỉ kiểm tra hữu hạn | Writer **SHOULD** giữ trong [0,100] |

Reader **SHOULD** chuẩn hoá phòng thủ các trường này khi nạp thay vì tin tưởng chúng.

---

# 12. CONFORMANCE CHECKLIST

## 12.1 Writer

* [ ] JSON UTF-8, không BOM, không comment
* [ ] `nodestarBackup: 1`, không ghi `spreadBackup`
* [ ] `map.version: 1`
* [ ] Mọi object thoả §4.1 và §4.2
* [ ] `tier` ∈ {10,20,30} trên **mọi** object
* [ ] Seed id duy nhất trên toàn map, `text` khác rỗng sau trim
* [ ] Cạnh thoả cả 6 bất biến §5.2, chiều PATH giữ nguyên
* [ ] `attachment` hoặc vắng mặt, hoặc trỏ tới PATH edge có `targetId` là chính object đó
* [ ] `anchorId` rỗng hoặc phân giải được
* [ ] `assets` chỉ chứa ảnh đang dùng, mỗi ảnh có `preview` là `data:image/…`
* [ ] `mapRef` được giữ nguyên trên object Graph
* [ ] Bỏ trường optional thay vì ghi `null`

## 12.2 Reader

* [ ] Chấp nhận cả `nodestarBackup` và `spreadBackup`
* [ ] Bỏ qua khoá envelope lạ
* [ ] Chạy đúng 7 bước §9, dừng ở bước đầu tiên thất bại
* [ ] Không ghi gì khi validate thất bại
* [ ] Giữ nguyên mọi id (import ≠ paste)
* [ ] Ghi asset + map trong một transaction
* [ ] Import undo được
* [ ] Import thành công dù `mapRef` treo lơ lửng
* [ ] Ép `status: 'saved'`, xoá `error` trên asset nạp vào
* [ ] Tự khởi tạo viewport, selection, focus

---

# APPENDIX A — JSON SCHEMA

Schema dưới đây kiểm tra **cấu trúc**. Các bất biến tham chiếu chéo — tính duy nhất id, DAG của PATH, trùng cặp, attachment, anchor, toàn vẹn ảnh — nằm ngoài khả năng biểu đạt của JSON Schema và **MUST** được kiểm tra bằng code theo §9.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://nodestar.app/schema/nmip-v1.json",
  "title": "Nodestar Map Interchange Protocol V1",
  "type": "object",
  "required": ["map"],
  "anyOf": [
    { "required": ["nodestarBackup"] },
    { "required": ["spreadBackup"] }
  ],
  "properties": {
    "nodestarBackup": { "const": 1 },
    "spreadBackup": { "const": 1 },
    "map": { "$ref": "#/$defs/visionMap" },
    "assets": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/asset" }
    }
  },
  "$defs": {
    "visionMap": {
      "type": "object",
      "required": ["version", "title", "anchorId", "objects", "relationships"],
      "properties": {
        "version": { "const": 1 },
        "title": { "type": "string" },
        "anchorId": { "type": "string" },
        "objects": { "type": "array", "items": { "$ref": "#/$defs/canvasObject" } },
        "relationships": { "type": "array", "items": { "$ref": "#/$defs/relationship" } }
      }
    },
    "canvasObject": {
      "type": "object",
      "required": [
        "id", "type", "role", "text", "note", "x", "y", "width", "height",
        "images", "seeds", "tier", "shuffle", "focal", "createdAt", "updatedAt"
      ],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "type": { "enum": ["NODE", "SEED_BOX", "IMAGINATION", "GRAPH"] },
        "role": { "enum": ["NORMAL", "GOAL"] },
        "text": { "type": "string" },
        "note": { "type": "string" },
        "x": { "type": "number" },
        "y": { "type": "number" },
        "width": { "type": "number", "minimum": 100, "maximum": 10000 },
        "height": { "type": "number", "minimum": 1 },
        "images": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "seeds": { "type": "array", "maxItems": 30, "items": { "$ref": "#/$defs/seed" } },
        "tier": { "enum": [10, 20, 30] },
        "shuffle": { "type": "number" },
        "focal": { "type": "number" },
        "focalX": { "type": "number" },
        "displayNote": { "type": "boolean" },
        "displayTitle": { "type": "boolean" },
        "manualHeight": { "type": "boolean" },
        "collapsed": { "type": "boolean" },
        "imaginationPreset": { "enum": ["small", "medium", "large"] },
        "imaginationLayout": { "enum": ["collage", "uniform", "gapless", "spaced"] },
        "attachment": { "type": "string" },
        "mapRef": { "type": "string" },
        "createdAt": { "type": "number" },
        "updatedAt": { "type": "number" }
      },
      "allOf": [
        {
          "if": { "properties": { "type": { "const": "NODE" } }, "required": ["type"] },
          "then": {
            "properties": { "images": { "maxItems": 1 }, "seeds": { "maxItems": 0 } },
            "not": { "required": ["mapRef"] }
          }
        },
        {
          "if": { "properties": { "type": { "const": "SEED_BOX" } }, "required": ["type"] },
          "then": {
            "properties": { "images": { "maxItems": 0 }, "role": { "const": "NORMAL" } },
            "not": { "required": ["mapRef"] }
          }
        },
        {
          "if": { "properties": { "type": { "const": "IMAGINATION" } }, "required": ["type"] },
          "then": {
            "properties": { "seeds": { "maxItems": 0 }, "role": { "const": "NORMAL" } },
            "not": { "required": ["mapRef"] }
          }
        },
        {
          "if": { "properties": { "type": { "const": "GRAPH" } }, "required": ["type"] },
          "then": {
            "required": ["mapRef"],
            "properties": {
              "images": { "maxItems": 0 },
              "seeds": { "maxItems": 0 },
              "role": { "const": "NORMAL" },
              "mapRef": { "type": "string", "minLength": 1 }
            }
          }
        }
      ]
    },
    "seed": {
      "type": "object",
      "required": ["id", "text", "visualSeed"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "text": { "type": "string", "minLength": 1 },
        "visualSeed": { "type": "number" }
      }
    },
    "relationship": {
      "type": "object",
      "required": ["id", "sourceId", "targetId", "type"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "sourceId": { "type": "string", "minLength": 1 },
        "targetId": { "type": "string", "minLength": 1 },
        "type": { "enum": ["PATH", "RELATED", "REFERENCE"] }
      }
    },
    "asset": {
      "type": "object",
      "required": ["id", "filename", "mimeType", "width", "height", "preview", "full"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "filename": { "type": "string" },
        "mimeType": { "type": "string" },
        "width": { "type": "number" },
        "height": { "type": "number" },
        "preview": { "type": "string", "pattern": "^data:image/" },
        "full": { "type": "string", "pattern": "^data:" },
        "status": { "enum": ["saved", "error"] },
        "error": { "type": "string" }
      }
    }
  }
}
```

---

# APPENDIX B — MINIMAL VALID DOCUMENT

Map nhỏ nhất còn có ý nghĩa: một central goal, một node đóng góp, một PATH chảy về phía goal.

```json
{
  "nodestarBackup": 1,
  "map": {
    "version": 1,
    "title": "My next chapter",
    "anchorId": "11111111-1111-4111-8111-111111111111",
    "objects": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "type": "NODE",
        "role": "GOAL",
        "text": "A life with room to create",
        "note": "",
        "x": 0,
        "y": 0,
        "width": 280,
        "height": 90,
        "images": [],
        "seeds": [],
        "tier": 10,
        "shuffle": 0.5,
        "focal": 50,
        "attachment": "33333333-3333-4333-8333-333333333333",
        "createdAt": 1758585600000,
        "updatedAt": 1758585600000
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "NODE",
        "role": "NORMAL",
        "text": "Build my own studio",
        "note": "",
        "x": 450,
        "y": -180,
        "width": 210,
        "height": 90,
        "images": [],
        "seeds": [],
        "tier": 10,
        "shuffle": 0.5,
        "focal": 50,
        "createdAt": 1758585600000,
        "updatedAt": 1758585600000
      }
    ],
    "relationships": [
      {
        "id": "33333333-3333-4333-8333-333333333333",
        "sourceId": "22222222-2222-4222-8222-222222222222",
        "targetId": "11111111-1111-4111-8111-111111111111",
        "type": "PATH"
      }
    ]
  },
  "assets": {}
}
```

Chú ý điểm dễ sai nhất: cạnh chảy **từ** node đóng góp **tới** goal, nên theo §5.4 `attachment` nằm trên **goal** — object ở đầu `targetId` — chứ không phải trên node. Đặt nhầm chỗ sẽ cho lỗi `This map contains an invalid branch attachment.`

---

# APPENDIX C — REFERENCE IMPLEMENTATION

| Phần | Vị trí |
| --- | --- |
| Kiểu dữ liệu map | `lib/graph.ts` — `Kind`, `CanvasObject`, `Seed`, `Relationship`, `VisionMap` |
| Validator | `lib/graph.ts` — `validateMap()` |
| Bất biến cạnh | `lib/graph.ts` — `relationType()`, `relationError()`, `connect()`, `reachable()` |
| Kiểu Asset, xử lý ảnh | `lib/storage.ts` — `Asset`, `processImage()` |
| Ghi atomically | `lib/storage.ts` — `saveAssetsAndMap()` |
| Export | `components/nodestar-editor.tsx` — `exportMap()` |
| Import | `components/nodestar-editor.tsx` — `importMap()` |
| Clipboard | `components/nodestar-editor.tsx` — `copy()`, handler `paste` |
| Catalog / mapRef | `lib/storage.ts` — `MapCatalog`, `MapEntry`; `hooks/use-workspace.ts` |
| Snapshot nội bộ (ngoài phạm vi NMIP) | `lib/workspace-snapshot.ts` |
