// File: api/get-drive-images.js

export default async function handler(req, res) {
    // Chỉ cho phép method GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Lấy link thư mục Drive từ URL web gửi lên
    const folderUrl = req.query.folderUrl;
    if (!folderUrl) {
        return res.status(400).json({ error: 'Missing folderUrl parameter' });
    }

    // Hàm bóc tách Folder ID từ link Drive của Admin dán
    const extractFolderId = (url) => {
        let match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        return null;
    };

    const folderId = extractFolderId(folderUrl);
    
    if (!folderId) {
        return res.status(400).json({ error: 'Không tìm thấy ID thư mục trong link.' });
    }

    // Thay thế bằng API Key bạn vừa lấy ở Bước 1
    const API_KEY = process.env.GOOGLE_DRIVE_API_KEY || "AIzaSyCnkBZGal4xkhqIdY70T50PMDROybCOdds"; 

    // API của Google Drive để lấy danh sách file trong thư mục
    const driveApiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,thumbnailLink,webContentLink)&key=${API_KEY}`;

    try {
        const response = await fetch(driveApiUrl);
        const data = await response.json();

        if (data.error) {
            console.error("Google API Error:", data.error);
            return res.status(500).json({ error: 'Lỗi từ Google Drive API: ' + data.error.message });
        }

        // Lọc ra chỉ lấy các file hình ảnh
        const images = data.files.filter(file => file.mimeType.startsWith('image/')).map(file => {
             // Sửa lại thumbnailLink để lấy ảnh chất lượng cao thay vì ảnh mờ mặc định
             let highResUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s2000') : '';
             
             return {
                 id: file.id,
                 name: file.name,
                 // Dùng thumbnailLink được resize sẽ nhanh và ít lỗi hơn webContentLink
                 url: highResUrl || file.webContentLink
             };
        });

        // Trả kết quả về cho Frontend (index.html)
        return res.status(200).json({ 
            success: true, 
            folderId: folderId,
            count: images.length,
            images: images 
        });

    } catch (error) {
        console.error("Fetch Error:", error);
        return res.status(500).json({ error: 'Lỗi server khi gọi Google API.' });
    }
}
