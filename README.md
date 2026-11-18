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

Trình duyệt chặn request cross-origin nếu server không trả header CORS. Nếu gặp lỗi network, chọn một proxy trong panel 01:

- `corsproxy.io` — `https://corsproxy.io/?url=<encoded>`
- `allorigins.win` — `https://api.allorigins.win/raw?url=<encoded>`
- `cors.isomorphic-git.org` — `<target>`
- Custom — template với `{url}`, `{url}` sẽ được encode

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
