'use strict';

// 1. 引入所需模块
const express = require('express');
const crypto = require('crypto');

// 2. 定义 Express 应用和端口
const app = express();
const PORT = 3000;

app.use(express.json());

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

// MODIFIED: Function signature now accepts 'columns' and 'report_type'
async function getTaskId(start_date, end_date, cookie, columns, report_type) {
    console.log(`内部函数: 正在为 [${report_type}] 报告类型提交新任务...`);
    const signatureData = generateSignatureHeaders("/api/sec/v1/sbtsource", { "callFrom": "web" });
    
    const requestBody = {
        task_name: "leona_ad_common_data_report_download",
        input: {
            extra: {
                v_seller_id: "658294f2bbe74b0001262038",
                // MODIFIED: Using the 'columns' parameter
                columns: columns,
                split_columns: [], need_total: true, need_list: true, need_size: true, time_unit: "DAY", page_size: 20, page_num: 1, sorts: [], 
                // MODIFIED: Using the 'report_type' parameter
                report_type: report_type.toUpperCase(), // API expects uppercase, e.g., "CAMPAIGN"
                start_date, end_date, filters: []
            }
        },
        source: "web", module_name: "leona"
    };
    
    // MODIFIED: Dynamically construct the Referer URL
    const refererUrl = `https://ad.xiaohongshu.com/aurora/ad/datareports-basic/${report_type}`;

    const response = await fetch("https://ad.xiaohongshu.com/api/leona/longTask/download/commit_task", {
        method: "POST",
        headers: {
            "accept": "application/json, text/plain, */*", "content-type": "application/json",
            "x-s": signatureData["X-s"], "x-t": String(signatureData["X-t"]), cookie,
            "Referer": refererUrl,
        }, body: JSON.stringify(requestBody)
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
// == API端点定义 (动态参数版)
// ===================================================================

// --- 端点 1: 创建任务 ---
app.post('/api/create-task', async (req, res) => {
    try {
        // MODIFIED: Get 'columns' and 'report_type' from request body
        const { start_date, end_date, cookie, columns, report_type } = req.body;
        if (!start_date || !end_date || !cookie || !columns || !report_type) {
            return res.status(400).json({ error: "Required fields: 'start_date', 'end_date', 'cookie', 'columns', 'report_type'." });
        }
        if (!Array.isArray(columns)) {
            return res.status(400).json({ error: "'columns' must be an array." });
        }
        
        // MODIFIED: Pass new arguments to the function
        const taskId = await getTaskId(start_date, end_date, cookie, columns, report_type);
        res.status(200).json({ message: "Task created successfully.", taskId });
    } catch (error) {
        console.error("Error in /api/create-task:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- 端点 2: 查询任务状态并获取最终结果 ---
app.get('/api/check-task-status/:taskId', async (req, res) => {
    let taskStatus = '';
    try {
        const { taskId } = req.params;
        // MODIFIED: Get 'report_type' from query parameters
        const { cookie, report_type } = req.query;
        if (!cookie || !report_type) {
            return res.status(400).json({ error: "Required query parameters: 'cookie', 'report_type'." });
        }

        const maxAttempts = 60, pollInterval = 1000;
        let attempts = 0;
        
        // MODIFIED: Dynamically construct the Referer URL for all subsequent requests
        const refererUrl = `https://ad.xiaohongshu.com/aurora/ad/datareports-basic/${report_type}`;

        console.log(`\n开始轮询任务 [${taskId}], 报告类型 [${report_type}], 每秒查询1次...`);

        while (attempts < maxAttempts) {
            attempts++;
            const statusUrl = `https://ad.xiaohongshu.com/api/leona/longTask/download/task/status?task_id=${taskId}`;
            const statusSignature = generateSignatureHeaders(statusUrl, {});
            const statusHeaders = { cookie, "x-s": statusSignature["X-s"], "x-t": String(statusSignature["X-t"]), "Referer": refererUrl };
            const statusResponse = await fetch(statusUrl, { headers: statusHeaders });
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

        console.log(`✅ 任务 [${taskId}] 已完成! 正在获取最终文件URL...`);
        const resultUrl = `https://ad.xiaohongshu.com/api/leona/longTask/download/task/result?task_id=${taskId}`;
        const resultSignature = generateSignatureHeaders(resultUrl, {});
        const resultHeaders = { cookie, "x-s": resultSignature["X-s"], "x-t": String(resultSignature["X-t"]), "Referer": refererUrl };
        const resultResponse = await fetch(resultUrl, { headers: resultHeaders });
        if (!resultResponse.ok) throw new Error(`获取最终结果失败! status: ${resultResponse.status}`);
        const finalResult = await resultResponse.json();
        console.log("✅ 成功获取最终结果!");
        return res.status(200).json(finalResult);

    } catch (error) {
        console.error("Error in /api/check-task-status:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===================================================================
// == 服务器启动
// ===================================================================
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});