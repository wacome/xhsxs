'use strict';

// 1. 引入所需模块
const express = require('express');
const crypto = require('crypto');
const xlsx = require('xlsx');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 2. 定义 Express 应用和端口
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' })); // 增加请求体大小限制以容纳大量数据

// ===================================================================
// == 配置区域
// ===================================================================
// 将您的AI Key安全地存放在后端
const AI_API_KEY = 'ae978c617ef94dec9a7fdbd62240f463.DuUjTrbV0uQDpZaj'; // 请替换为您的智谱AI API Key
const AI_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_MODEL = 'glm-4.5';


// ===================================================================
// == 核心签名与业务逻辑函数
// ===================================================================

const CUSTOM_CHAR_SET = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3";

function customBase64Encode(buffer) {
    let result = '';
    for (let i = 0; i < buffer.length; i += 3) {
        const byte1 = buffer[i], byte2 = i + 1 < buffer.length ? buffer[i + 1] : NaN, byte3 = i + 2 < buffer.length ? buffer[i + 2] : NaN;
        const index1 = byte1 >> 2, index2 = ((byte1 & 3) << 4) | (byte2 >> 4), index3 = ((byte2 & 15) << 2) | (byte3 >> 6), index4 = byte3 & 63;
        result += CUSTOM_CHAR_SET.charAt(index1) + CUSTOM_CHAR_SET.charAt(index2) + (isNaN(byte2) ? CUSTOM_CHAR_SET.charAt(64) : CUSTOM_CHAR_SET.charAt(index3)) + (isNaN(byte3) ? CUSTOM_CHAR_SET.charAt(64) : CUSTOM_CHAR_SET.charAt(index4));
    }
    return result;
}

function generateSignatureHeaders(e, t = {}) {
    const o = "test", a = new Date().getTime(), sourceString = [ a, o, e, JSON.stringify(t) ].join('');
    const hashBuffer = crypto.createHash('sha256').update(sourceString, 'utf-8').digest();
    const signature = customBase64Encode(hashBuffer);
    return { "X-s": signature, "X-t": a };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getProxyAgent() {
    try {
        console.log("正在获取新的代理IP...");
        const proxyApiUrl = 'http://v2.api.juliangip.com/company/postpay/getips?auto_white=1&num=1&pt=1&result_type=text&split=1&trade_no=6665272237296207&sign=c87b82e9cb6e268872753ad85bb2c74e';
        const response = await fetch(proxyApiUrl);
        if (!response.ok) throw new Error(`获取代理IP失败, status: ${response.status}`);
        const proxyIp = await response.text();
        if (!proxyIp || !proxyIp.includes(':')) throw new Error(`获取到的代理IP格式无效: ${proxyIp}`);
        const proxyUrl = `http://${proxyIp.trim()}`;
        console.log(`获取成功，将使用代理: ${proxyUrl}`);
        return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
        console.error("无法获取代理IP，将尝试直接连接。", error.message);
        return null;
    }
}

async function getTaskId(start_date, end_date, cookie, columns, report_type, agent) {
    console.log(`内部函数: 正在为 [${report_type}] 报告类型提交新任务...`);
    const signatureData = generateSignatureHeaders("/api/sec/v1/sbtsource", { "callFrom": "web" });
    const requestBody = {
        task_name: "leona_ad_common_data_report_download",
        input: {
            extra: {
                v_seller_id: "658294f2bbe74b0001262038",
                columns: columns,
                split_columns: [], need_total: true, need_list: true, need_size: true, time_unit: "DAY", page_size: 20, page_num: 1, sorts: [],
                report_type: report_type.toUpperCase(),
                start_date, end_date, filters: []
            }
        }, source: "web", module_name: "leona"
    };
    const refererUrl = `https://ad.xiaohongshu.com/aurora/ad/datareports-basic/${report_type}`;
    const response = await fetch("https://ad.xiaohongshu.com/api/leona/longTask/download/commit_task", {
        method: "POST",
        headers: {
            "accept": "application/json, text/plain, */*", "content-type": "application/json",
            "x-s": signatureData["X-s"], "x-t": String(signatureData["X-t"]), cookie,
            "Referer": refererUrl,
        },
        body: JSON.stringify(requestBody),
        agent: agent
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`获取Task ID失败! status: ${response.status}, message: ${errorText}`);
    }
    const data = await response.json();
    console.log("内部函数: 成功获取 Task ID:", data.data.task_id);
    return data.data.task_id;
}

// ===================================================================
// == API端点定义
// ===================================================================

app.post('/api/get-report', async (req, res) => {
    let taskStatus = '';
    try {
        const { start_date, end_date, cookie, columns, report_type } = req.body;
        if (!start_date || !end_date || !cookie || !columns || !report_type) {
            return res.status(400).json({ error: "Required fields: 'start_date', 'end_date', 'cookie', 'columns', 'report_type'." });
        }
        const agent = await getProxyAgent();
        const taskId = await getTaskId(start_date, end_date, cookie, columns, report_type, agent);
        const maxAttempts = 60, pollInterval = 1000;
        let attempts = 0;
        const refererUrl = `https://ad.xiaohongshu.com/aurora/ad/datareports-basic/${report_type}`;
        console.log(`\n开始轮询任务 [${taskId}], 每秒查询1次...`);
        while (attempts < maxAttempts) {
            attempts++;
            const statusUrl = `https://ad.xiaohongshu.com/api/leona/longTask/download/task/status?task_id=${taskId}`;
            const statusSignature = generateSignatureHeaders("/api/sec/v1/sbtsource", { "callFrom": "web" });
            const statusHeaders = { cookie, "x-s": statusSignature["X-s"], "x-t": String(statusSignature["X-t"]), "Referer": refererUrl };
            const statusResponse = await fetch(statusUrl, { headers: statusHeaders, agent: agent });
            if (!statusResponse.ok) throw new Error(`查询任务状态失败! status: ${statusResponse.status}`);
            const statusData = await statusResponse.json();
            taskStatus = statusData.data?.status;
            console.log(`第 ${attempts} 次查询: 任务 [${taskId}] 状态是 [${taskStatus}]`);
            if (taskStatus === 'FINISHED') break;
            if (taskStatus === 'FAILED') throw new Error("任务执行失败!");
            await sleep(pollInterval);
        }
        if (taskStatus !== 'FINISHED') {
            return res.status(408).json({ message: `轮询超时, 任务在 ${maxAttempts} 秒内未完成。` });
        }
        console.log(`✅ 任务 [${taskId}] 已完成! 正在获取最终结果...`);
        const resultUrl = `https://ad.xiaohongshu.com/api/leona/longTask/download/task/result?task_id=${taskId}`;
        const resultSignature = generateSignatureHeaders("/api/sec/v1/sbtsource", { "callFrom": "web" });
        const resultHeaders = { cookie, "x-s": resultSignature["X-s"], "x-t": String(resultSignature["X-t"]), "Referer": refererUrl };
        const resultResponse = await fetch(resultUrl, { headers: resultHeaders, agent: agent });
        if (!resultResponse.ok) throw new Error(`获取最终结果失败! status: ${resultResponse.status}`);
        const finalResult = await resultResponse.json();
        const fileUrl = finalResult.data?.result?.file_url;
        if (!fileUrl) throw new Error("任务已完成，但响应中未找到 file_url。");
        console.log(`✅ 正在从 ${fileUrl} 下载报表...`);
        const fileResponse = await fetch(fileUrl, { agent: agent });
        if (!fileResponse.ok) throw new Error(`下载报表文件失败! status: ${fileResponse.status}`);
        let fileContentAsText = '';
        if (fileUrl.includes('.csv')) {
            fileContentAsText = await fileResponse.text();
            console.log("✅ CSV文件已下载并读取为文本。");
        } else if (fileUrl.includes('.xlsx')) {
            const buffer = await fileResponse.arrayBuffer();
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            fileContentAsText = xlsx.utils.sheet_to_csv(worksheet);
            console.log("✅ XLSX文件已下载并转换为CSV格式文本。");
        } else {
            fileContentAsText = await fileResponse.text();
            console.warn("⚠️ 未知文件类型，已尝试作为纯文本读取。");
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(fileContentAsText);
    } catch (error) {
        console.error("Error in /api/get-report:", error);
        res.status(500).json({ error: error.message });
    }
});

// MODIFIED: New endpoint to handle AI requests securely
app.post('/api/get-ai-analysis', async (req, res) => {
    try {
        const { systemPrompt, conversationHistory } = req.body;
        if (!systemPrompt || !conversationHistory) {
            return res.status(400).json({ error: "Required fields: 'systemPrompt', 'conversationHistory'." });
        }

        const messagesForApi = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
        ];
        const requestBody = {
            model: AI_MODEL,
            messages: messagesForApi,
            stream: false // Backend will get the full response
        };

        console.log("后端正在向智谱AI发送请求...");
        const aiResponse = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`智谱AI API请求失败! Status: ${aiResponse.status}, Message: ${errorText}`);
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error("AI响应中未找到有效内容。");
        }

        console.log("后端成功获取AI分析结果。");
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(content);

    } catch (error) {
        console.error("Error in /api/get-ai-analysis:", error);
        res.status(500).json({ error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`✅ Server with Proxy and AI Proxy is running on http://localhost:${PORT}`);
});
