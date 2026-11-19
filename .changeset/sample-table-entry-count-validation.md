---
'mp4box': patch
---

Validate declared entry counts against the bytes actually carried by table-style sample boxes. An inflated count no longer reads into neighboring boxes, throws a raw out-of-bounds error, or drives a count-sized allocation; malformed boxes now fail fast through the existing invalid-data error channel (`onError`) like other box validation errors
