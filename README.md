# ai-api-test

Test API AI trực tiếp trên browser — không backend, không build step, một trang duy nhất.

**Live:** https://6zev.github.io/ai-api-test/

## Tính năng

- **4 type API**: OpenAI Chat (`/chat/completions`), OpenAI Responses (`/responses`), Gemini (`:generateContent`), Anthropic (`/messages`)
- **Check chuẩn API** — probe song song 4 endpoint, biết ngay server nói được ngôn ngữ nào
- **Fetch model** — tự dò `/models`, đổ ra list có filter, chọn bằng 1 click
- **Metadata model** — owned_by, created, context window, pricing, modality, endpoint thật
- **Test model** — đo TTFT, tổng thời gian, tokens, tok/s; chế độ `×3 bench` lấy trung bình
- **Stream** — đọc SSE thật, đo được TTFT (chỉ số quan trọng nhất khi stream)
- **CORS proxy** — sẵn 4 lựa chọn vì OpenAI/Anthropic/Gemini chặn request thẳng từ browser
- Key lưu tuỳ chọn trong localStorage, theme sáng/tối, `Ctrl+Enter` để test nhanh

## Dùng

Mở trang, dán **Base URL** + **API Key**, rồi:

1. **Check chuẩn API** → badge xanh = server hỗ trợ chuẩn đó
2. **Fetch model** → chọn model trong list
3. **Test model** → xem có work không, nhanh hay chậm

Base URL chỉ cần gốc (`https://api.openai.com/v1`); dán kèm path endpoint cũng được, tool tự cắt.

| Provider | Base URL |
| --- | --- |
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| xAI | `https://api.x.ai/v1` |
| Together | `https://api.together.xyz/v1` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` |
| Anthropic | `https://api.anthropic.com/v1` |

## CORS

Trình duyệt chặn request cross-origin nếu server không trả header CORS. Mặc định tool để **Auto**: thử direct trước, chặn thì chuyển sang corsfix.

Còn đúng **một** proxy free không cần key hoạt động được: **corsfix**. Mọi lựa chọn khác đã bị bỏ sau khi test thật từ browser:

| Proxy | Kết quả test | Trạng thái |
| --- | --- | --- |
| **corsfix** `?sdk=1` | `200`, trả JSON + SSE, pass POST body & header | ✅ giữ |
| corsproxy.io | `401` — free tier bắt buộc API key | ❌ bỏ |
| allorigins.win | `200` với trang tĩnh nhưng `522` với API thật, chậm ~20s | ❌ bỏ |
| api.codetabs.com | `522` / timeout, không trả CORS header | ❌ bỏ |
| cors.isomorphic-git.org | `403`, không trả CORS header | ❌ bỏ |
| test.cors.workers.dev | `429` rate limit, không trả CORS header | ❌ bỏ |
| thingproxy.freeboard.io | DNS chết | ❌ bỏ |

Chế độ **Auto** = `direct → corsfix`. Nếu API đích bật CORS sẵn thì direct nhanh hơn và không tốn quota; chỉ khi bị chặn mới đi qua corsfix.

> corsfix free tier: không cần key, 60 req/phút, 10MB/tháng (đăng ký domain ở app.corsfix.com → 100MB). Nó **chỉ proxy domain public** — target là `localhost`/IP nội bộ sẽ trả `invalid_url`.

Anthropic có hỗ trợ chính thức cho browser qua header `anthropic-dangerous-direct-browser-access: true` (tool đã gắn sẵn).

## Chạy local

Không cần cài gì — mở thẳng `index.html` bằng browser. Hoặc:

```bash
python3 -m http.server 8899
# http://127.0.0.1:8899
```

## Cấu trúc

```
index.html   layout 3 cột: kết nối / model / check & test
style.css    theme tối + sáng, grid layout responsive
app.js       state, 4 adapter, probe, SSE parser, đo tốc độ
```

Không dependency, không bundler, không framework.
