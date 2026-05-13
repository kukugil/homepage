const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// 从环境变量获取 API Key，如果没有则使用默认值（请填入你的真实 API Key）
const API_KEY = process.env.API_KEY || "602e1227a71e4c4d878ef91ef56ca779.i098ounGnJUBKyFM";  // 替换为你的真实 API Key

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const response = await axios.post(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      {
        model: "glm-4-flash",
        messages: [
          { role: "system", content: "你是贾维斯，说话带四川口音，轻松直接" },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      reply: response.data.choices[0].message.content
    });

  } catch (error) {
    console.error("错误：", error.response?.data || error.message);
    res.json({ reply: "请求AI失败" });
  }
});

app.listen(3005, () => {
  console.log("✅ 后端已启动：http://localhost:3005");
});
