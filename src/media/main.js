// This script will be run in the webview itself
(function () {
    const app = document.getElementById('app');

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'updateState':
                render(message.state);
                break;
        }
    });

    function render(state) {
        if (!state || !state.paragraphs || state.paragraphs.length === 0) {
            app.innerHTML = '<p>No paragraphs found or document is empty.</p>';
            return;
        }

        app.innerHTML = ''; // Clear previous content

        for (const p of state.paragraphs) {
            const paragraphDiv = document.createElement('div');
            paragraphDiv.className = `paragraph-item state-${p.state}`;
            
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'paragraph-summary';

            switch (p.state) {
                case 'summarizing':
                    summaryDiv.textContent = '⏳ Summarizing...';
                    break;
                case 'success':
                    summaryDiv.textContent = p.summary || '✅ Summary completed';
                    break;
                case 'failed':
                    summaryDiv.textContent = '⚠️ Summarization failed';
                    break;
                case 'initial':
                default:
                    summaryDiv.textContent = `Paragraph (ID: ${p.id.substring(0,6)})`;
                    break;
            }

            const textDiv = document.createElement('div');
            textDiv.className = 'paragraph-text';
            textDiv.textContent = p.text;

            paragraphDiv.appendChild(summaryDiv);
            paragraphDiv.appendChild(textDiv);
            app.appendChild(paragraphDiv);
        }
    }
}());