'use strict';

// 1. 引入所需模块
const express = require('express');
const crypto = require('crypto');

// 2. 定义 Express 应用和端口
const app = express();
const PORT = 3000;

// ===================================================================
// == 核心签名逻辑 (与之前版本保持一致)
// ===================================================================

const CUSTOM_CHAR_SET = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3";

function customBase64Encode(buffer) {
    let result = '';
    for (let i = 0; i < buffer.length; i += 3) {
        const byte1 = buffer[i];
        const byte2 = i + 1 < buffer.length ? buffer[i + 1] : NaN;
        const byte3 = i + 2 < buffer.length ? buffer[i + 2] : NaN;

        const index1 = byte1 >> 2;
        const index2 = ((byte1 & 3) << 4) | (byte2 >> 4);
        const index3 = ((byte2 & 15) << 2) | (byte3 >> 6);
        const index4 = byte3 & 63;
        
        const char3 = isNaN(byte2) ? CUSTOM_CHAR_SET.charAt(64) : CUSTOM_CHAR_SET.charAt(index3);
        const char4 = isNaN(byte3) ? CUSTOM_CHAR_SET.charAt(64) : CUSTOM_CHAR_SET.charAt(index4);

        result += CUSTOM_CHAR_SET.charAt(index1) + CUSTOM_CHAR_SET.charAt(index2) + char3 + char4;
    }
    return result;
}

function generateSignatureHeaders(e, t = {}) {
    const o = "test";
    const a = new Date().getTime();
    const sourceString = [ a, o, e, JSON.stringify(t) ].join('');
    
    const hashBuffer = crypto.createHash('sha256').update(sourceString, 'utf-8').digest();
    const signature = customBase64Encode(hashBuffer);

    return {
        "X-s": signature,
        "X-t": a
    };
}

// ===================================================================
// == 3. 创建API端点 (核心修改部分)
// ===================================================================

app.get('/api/get-signature', (req, res) => {
    try {
        // 直接在这里定义写死的 e 和 t 参数
        const hardcoded_e = "/api/sec/v1/sbtsource";
        const hardcoded_t = { "callFrom": "web" };

        console.log(`Received request. Generating signature with hardcoded params: e='${hardcoded_e}', t=${JSON.stringify(hardcoded_t)}`);

        // 调用核心逻辑生成签名对象
        const signatureData = generateSignatureHeaders(hardcoded_e, hardcoded_t);

        // 将生成的对象作为JSON响应返回
        res.status(200).json(signatureData);

    } catch (error) {
        console.error("Error generating signature:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 默认根路径的欢迎信息
app.get('/', (req, res) => {
    res.send('Hardcoded signature server is running. Please GET from /api/get-signature.');
});

// ===================================================================
// == 4. 启动服务器
// ===================================================================

app.listen(PORT, () => {
    console.log(`✅ Hardcoded signature server is running on http://localhost:${PORT}`);
    console.log(`🚀 Send GET requests to http://localhost:${PORT}/api/get-signature`);
});