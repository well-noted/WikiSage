# WikiSage

![image](https://github.com/user-attachments/assets/31e54076-cd69-4c57-a7b9-22a8ad10c654)

WikiSage is an AI companion plugin for [TiddlyWiki](https://tiddlywiki.com) that leverages multiple language models (OpenAI's GPT and o1 models and Anthropic's Claude) to enhance your wiki experience.


<h2>Features</h2>
<ul>
    <li>Multi-model support (ChatGPT and Claude)</li>
    <li>PDF analysis and processing (requires anthropic)</li> 
    <li>Image generation (DALL-E 3) and handling</li>
    <li>Voice interaction (speech-to-text and text-to-speech)</li>
    <li>Smart content editing with macros</li>
    <li>Context-aware wiki operations</li>
    <li>Conversation history management</li>
    <li>Intelligent search and navigation</li>
</ul>

<h2>Installation</h2>
<ol>
    <li>Install <a href="https://github.com/well-noted/WikiSage/raw/main/WikiSage.tid">WikiSage</a> in your TiddlyWiki.</li>
    <li>Add your API keys:
        <ul>
            <li>OpenAI API key in <code>$:/plugins/NoteStreams/WikiSage/openai-api-key</code></li>
            <li>Anthropic API key in <code>$:/plugins/NoteStreams/WikiSage/anthropic-api-key</code></li>
            <li>Gemini API key in $:/plugins/NoteStreams/WikiSage/gemini-api-key</li>
        </ul>
    </li>
</ol>

<h2>Usage</h2>
<p>Basic widget usage:</p>
<pre><code>&lt;$WikiSage/&gt;</code></pre>

<p>With options:</p>
<pre><code>&lt;$WikiSage tiddlerTitle="Context" tts="yes" adversarial="yes" /&gt;</code></pre>

<h2>Configuration</h2>
<p>The plugin supports various other configuration options:</p>
<ul>
- model<br>
- temperature<br>
- top_p<br>
- max_tokens<br>
- presence_penalty<br>
- frequency_penalty<br>
- user<br>
</ul>

<h2>Note</h2>
''Important Note:'' While this plugin supports advanced interactions within TiddlyWiki, please be aware of the implications of AI-driven content modifications. The agent cannot delete tiddlers directly but can modify content in potentially destructive ways. The undo functionality is robust and can resolve most issues, but maintaining backups is strongly recommended.<br><br>
