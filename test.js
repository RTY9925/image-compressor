/**
 * @fileoverview 批量设计文件导出工具的主要功能实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const exportBtn = document.getElementById('exportBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = progressBar.querySelector('.progress-fill');
    const downloadArea = document.getElementById('downloadArea');
    const resolutionSelect = document.getElementById('resolution');
    const customResolutionInput = document.getElementById('customResolution');
    const qualityInput = document.getElementById('quality');
    const qualityValue = document.getElementById('qualityValue');
    const formatSelect = document.getElementById('format');

    // 存储上传的文件
    let uploadedFiles = [];
    // 存储导出的文件
    let exportedFiles = [];

    /**
     * 初始化事件监听器
     */
    function initializeEventListeners() {
        // 拖放区域事件
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.backgroundColor = '#e3f2fd';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.backgroundColor = '';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.backgroundColor = '';
            handleFiles(e.dataTransfer.files);
        });

        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        // 分辨率选择事件
        resolutionSelect.addEventListener('change', () => {
            customResolutionInput.style.display = 
                resolutionSelect.value === 'custom' ? 'block' : 'none';
        });

        // 质量滑块事件
        qualityInput.addEventListener('input', () => {
            qualityValue.textContent = `${qualityInput.value}%`;
        });

        // 导出按钮事件
        exportBtn.addEventListener('click', startExport);

        // 下载按钮事件
        downloadBtn.addEventListener('click', downloadFiles);
    }

    /**
     * 将ArrayBuffer转换为Base64字符串
     * @param {ArrayBuffer} buffer - 要转换的ArrayBuffer
     * @returns {string} Base64字符串
     */
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * 处理文件上传
     * @param {FileList} files - 上传的文件列表
     */
    function handleFiles(files) {
        const validFiles = Array.from(files).filter(file => 
            file.name.toLowerCase().endsWith('.psd') || 
            file.name.toLowerCase().endsWith('.psb')
        );

        if (validFiles.length === 0) {
            alert('请选择PSD或PSB文件！');
            return;
        }

        uploadedFiles = [...uploadedFiles, ...validFiles];
        updateFileList();
        exportBtn.disabled = uploadedFiles.length === 0;
    }

    /**
     * 更新文件列表显示
     */
    function updateFileList() {
        fileList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span>${file.name}</span>
                <button onclick="removeFile(${index})" class="btn" style="margin-left: auto;">删除</button>
            `;
            fileList.appendChild(fileItem);
        });
    }

    /**
     * 删除文件
     * @param {number} index - 要删除的文件索引
     */
    window.removeFile = (index) => {
        uploadedFiles.splice(index, 1);
        updateFileList();
        exportBtn.disabled = uploadedFiles.length === 0;
    };

    /**
     * 处理PSD文件并生成预览
     * @param {File} file - PSD文件
     * @param {Object} settings - 导出设置
     * @returns {Promise<Blob>} 处理后的文件
     */
    async function processPSDFile(file, settings) {
        try {
            // 读取文件内容
            const arrayBuffer = await file.arrayBuffer();
            
            // 使用PSD.js解析PSD文件
            const psd = await PSD.fromByteArray(arrayBuffer);
            
            // 将PSD转换为canvas
            const canvas = psd.image.toPng();
            
            // 创建一个新的canvas用于调整大小和质量
            const exportCanvas = document.createElement('canvas');
            const ctx = exportCanvas.getContext('2d');
            
            // 计算新的尺寸
            const scale = settings.resolution / 72; // PSD默认72dpi
            exportCanvas.width = canvas.width * scale;
            exportCanvas.height = canvas.height * scale;
            
            // 使用高质量的图像缩放
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // 绘制调整后的图像
            ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
            
            // 转换为blob
            const blob = await new Promise(resolve => {
                exportCanvas.toBlob(blob => {
                    resolve(blob);
                }, `image/${settings.format}`, settings.quality);
            });
            
            // 添加预览
            await addPreview(blob, file.name, settings.format);
            
            // 清理内存
            canvas.remove();
            exportCanvas.remove();
            
            return blob;
        } catch (error) {
            console.error('处理PSD文件时出错:', error);
            throw new Error(`处理文件 ${file.name} 时出错: ${error.message}`);
        }
    }

    /**
     * 添加预览图片
     * @param {Blob} blob - 图片blob数据
     * @param {string} fileName - 原文件名
     * @param {string} format - 导出格式
     */
    async function addPreview(blob, fileName, format) {
        const previewArea = document.getElementById('previewArea');
        const previewGrid = document.getElementById('previewGrid');
        
        // 显示预览区域
        previewArea.style.display = 'block';
        
        // 创建预览项
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        
        // 创建预览图片
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        
        // 创建文件名显示
        const fileNameDiv = document.createElement('div');
        fileNameDiv.className = 'file-name';
        fileNameDiv.textContent = fileName.replace(/\.(psd|psb)$/i, `.${format}`);
        
        // 创建控制按钮
        const controls = document.createElement('div');
        controls.className = 'preview-controls';
        
        // 下载按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.title = '下载此图片';
        downloadBtn.onclick = () => {
            const link = document.createElement('a');
            link.href = img.src;
            link.download = fileNameDiv.textContent;
            link.click();
        };
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = '删除预览';
        deleteBtn.onclick = () => {
            previewItem.remove();
            if (previewGrid.children.length === 0) {
                previewArea.style.display = 'none';
            }
        };
        
        // 组装预览项
        controls.appendChild(downloadBtn);
        controls.appendChild(deleteBtn);
        previewItem.appendChild(img);
        previewItem.appendChild(controls);
        previewItem.appendChild(fileNameDiv);
        previewGrid.appendChild(previewItem);
    }

    /**
     * 开始导出过程
     */
    async function startExport() {
        if (uploadedFiles.length === 0) return;

        const settings = {
            resolution: resolutionSelect.value === 'custom' 
                ? parseInt(customResolutionInput.value) 
                : parseInt(resolutionSelect.value),
            quality: parseInt(qualityInput.value) / 100,
            format: formatSelect.value
        };

        exportBtn.disabled = true;
        progressBar.style.display = 'block';
        exportedFiles = [];
        
        // 清空预览区域
        const previewGrid = document.getElementById('previewGrid');
        previewGrid.innerHTML = '';
        document.getElementById('previewArea').style.display = 'none';

        try {
            for (let i = 0; i < uploadedFiles.length; i++) {
                const file = uploadedFiles[i];
                const progress = ((i + 1) / uploadedFiles.length) * 100;
                progressFill.style.width = `${progress}%`;

                try {
                    const result = await processPSDFile(file, settings);
                    exportedFiles.push(result);
                } catch (error) {
                    console.error(`处理文件 ${file.name} 失败:`, error);
                    alert(`处理文件 ${file.name} 失败: ${error.message}`);
                    continue; // 继续处理下一个文件
                }
            }

            if (exportedFiles.length > 0) {
                downloadArea.style.display = 'block';
            }
        } catch (error) {
            console.error('导出过程出错:', error);
            alert('导出过程中出现错误，请重试');
        } finally {
            exportBtn.disabled = false;
            progressBar.style.display = 'none';
        }
    }

    /**
     * 下载处理后的文件
     */
    function downloadFiles() {
        if (exportedFiles.length === 0) return;

        const zip = new JSZip();
        const format = formatSelect.value;

        exportedFiles.forEach((file, index) => {
            const fileName = uploadedFiles[index].name.replace(/\.(psd|psb)$/i, `.${format}`);
            zip.file(fileName, file);
        });

        zip.generateAsync({ type: 'blob' })
            .then(content => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `exported_images.zip`;
                link.click();
                URL.revokeObjectURL(link.href);
            })
            .catch(error => {
                console.error('打包文件时出错:', error);
                alert('下载文件时出现错误，请重试');
            });
    }

    // 初始化应用
    initializeEventListeners();
}); 