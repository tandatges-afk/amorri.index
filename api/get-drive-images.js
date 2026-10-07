// File: api/get-drive-images.js

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const folderUrl = req.query.folderUrl;
    if (!folderUrl) return res.status(400).json({ error: 'Missing folderUrl parameter' });

    const extractFolderId = (url) => {
        let match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        return null;
    };

    const folderId = extractFolderId(folderUrl);
    if (!folderId) return res.status(400).json({ error: 'Không tìm thấy ID thư mục trong link.' });

    const API_KEY = process.env.GOOGLE_DRIVE_API_KEY || "AIzaSyCnkBZGal4xkhqIdY70T50PMDROybCOdds"; 

    // API lấy cả ảnh và video
    const driveApiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,thumbnailLink,webContentLink)&key=${API_KEY}`;

    try {
        const response = await fetch(driveApiUrl);
        const data = await response.json();

        if (data.error) {
            console.error("Google API Error:", data.error);
            return res.status(500).json({ error: 'Lỗi từ Google Drive API: ' + data.error.message });
        }

        // Lọc lấy cả image/ và video/
        const mediaFiles = data.files.filter(file => file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/')).map(file => {
             let highResUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s2000') : '';
             let isVideo = file.mimeType.startsWith('video/');
             
             return {
                 id: file.id,
                 name: file.name,
                 isVideo: isVideo,
                 thumb: highResUrl || file.thumbnailLink, // Dùng làm ảnh bìa để render ra giao diện chọn
                 url: isVideo ? `https://drive.google.com/file/d/${file.id}/view` : (highResUrl || file.webContentLink)
             };
        });

        return res.status(200).json({ 
            success: true, 
            folderId: folderId,
            count: mediaFiles.length,
            images: mediaFiles 
        });

    } catch (error) {
        console.error("Fetch Error:", error);
        return res.status(500).json({ error: 'Lỗi server khi gọi Google API.' });
    }
}
