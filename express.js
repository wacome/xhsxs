'use strict';

// 1. 引入所需模块
const express = require('express');
const crypto = require('crypto');
// Correctly import node-fetch for CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 2. 定义 Express 应用和端口
const app = express();
const PORT = 3000;

// Middleware to parse JSON request bodies, needed for the new endpoint
app.use(express.json());

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
// == 3. 创建API端点
// ===================================================================

app.get('/api/get-signature', (req, res) => {
    try {
        const hardcoded_e = "/api/sec/v1/sbtsource";
        const hardcoded_t = { "callFrom": "web" };
        const signatureData = generateSignatureHeaders(hardcoded_e, hardcoded_t);
        res.status(200).json(signatureData);
    } catch (error) {
        console.error("Error generating signature:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Changed to POST to accept start_date and end_date in the body
app.post('/api/get-task-id', async (req, res) => {
    try {
        // Get dates from the request body
        const { start_date, end_date, cookie } = req.body;
        if (!start_date || !end_date || !cookie) {
            return res.status(400).json({ error: "Please provide 'start_date' and 'end_date' amd 'cookie' in the request body." });
        }

        const hardcoded_e = "/api/sec/v1/sbtsource";
        const hardcoded_t = { "callFrom": "web" };
        const signatureData = generateSignatureHeaders(hardcoded_e, hardcoded_t);
        const xs = signatureData["X-s"];
        const xt = signatureData["X-t"];

        // Corrected body construction
        const requestBody = {
            task_name: "leona_ad_common_data_report_download",
            input: {
                extra: {
                    v_seller_id: "658294f2bbe74b0001262038",
                    columns: ["campaignName", "campaignId", "fee", "impression", "click", "ctr", "acp", "cpm", "like", "comment", "collect", "follow", "share", "interaction", "cpi", "actionButtonClick", "actionButtonCtr", "screenshot", "picSave", "reservePV", "liveSubscribeCnt", "liveSubscribeCntCost", "searchCmtClick", "searchCmtClickCvr", "searchCmtAfterReadAvg", "searchCmtAfterRead", "clkLiveRoomOrderNum", "liveAverageOrderCost", "clkLiveRoomRgmv", "clkLiveRoomRoi", "searchFirstShowImpRate", "searchFirstShowClickRate", "mTransAddWechatMessageUserCnt", "mTransAddWechatMessageUserCost", "mTransAddWechatSucMessageClueUidCnt", "mTransAddWechatSucMessageClueUidCost"],
                    split_columns: [],
                    need_total: true,
                    need_list: true,
                    need_size: true,
                    time_unit: "DAY",
                    page_size: 20,
                    page_num: 1,
                    sorts: [],
                    report_type: "CAMPAIGN",
                    start_date: start_date,
                    end_date: end_date,
                    filters: []
                }
            },
            source: "web",
            module_name: "leona"
        };
        
        const response = await fetch("https://ad.xiaohongshu.com/api/leona/longTask/download/commit_task", {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "x-s": xs,
                "x-t": xt,
                "cookie": cookie,
                "Referer": "https://ad.xiaohongshu.com/aurora/ad/datareports-basic/campaign",
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            // If the external API call fails, send back its status and message
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        // Assuming the actual task ID is in a field like 'data' in the response
        res.status(200).json(data['data']['task_id']); 

    } catch (error) {
        console.error("Error fetching task ID:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

app.get('/api/check-task-status', async (req, res) => {
    try {
        // --- FIX: Read from req.query for GET requests, not req.body ---
        const { taskid, cookie } = req.query; 

        // Add validation for the query parameters
        if (!taskid || !cookie) {
            return res.status(400).json({ error: "Please provide 'taskid' and 'cookie' as query parameters." });
        }
        
        // --- The rest of your logic remains the same ---
        const targetUrl = `https://ad.xiaohongshu.com/api/leona/longTask/download/task/status?task_id=${taskid}`;
        
        const hardcoded_e = "/api/sec/v1/sbtsource";
        const hardcoded_t = { "callFrom": "web" };
        const signatureData = generateSignatureHeaders(hardcoded_e, hardcoded_t);
        const xs = signatureData["X-s"];
        const xt = String(signatureData["X-t"]); // Ensure x-t is a string

        const headersForFetch = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9",
            "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-b3-traceid": "2fff141fa4e28bef",
            "x-s": xs,
            "x-t": xt,
            "cookie": cookie,
            "Referer": "https://ad.xiaohongshu.com/aurora/ad/datareports-basic/campaign",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        };

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: headersForFetch
        });

        const data = await response.json();
        res.status(response.status).json(data['data']);

    } catch (error) {
        console.error("Error in proxy fetch:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

// ===================================================================
// == 4. 启动服务器
// ===================================================================

app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});