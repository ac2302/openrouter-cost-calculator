import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import { openDB } from "idb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dark } from "react-syntax-highlighter/dist/esm/styles/prism";
import light from "react-syntax-highlighter/dist/esm/styles/prism/prism";

const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 5; // Retry up to 5 times
const DEFAULT_SELECTOR_ORDER = "modelFirst"; // Default order

function App() {
  const [apiKey, setApiKey] = useState("");
  const [storedApiKey, setStoredApiKey] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);

  // UI state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    return savedTheme === "dark";
  });
  // Mobile sidebar visibility state - start open on mobile devices
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return window.innerWidth > 768; // Open on desktop, closed on mobile by default
  });

  // IndexedDB state for saved chats
  const [db, setDb] = useState(null);
  const [savedChats, setSavedChats] = useState([]);
  const [selectedSavedChatId, setSelectedSavedChatId] = useState("");

  // --- New State ---
  const [selectorOrder, setSelectorOrder] = useState(DEFAULT_SELECTOR_ORDER); // 'modelFirst' or 'providerFirst'
  // State to hold the model/provider info for the *currently displayed* chat (new or loaded)
  const [currentChatInfo, setCurrentChatInfo] = useState({
    model: "",
    provider: "",
  });

  // Search state for dropdowns
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [providerSearchTerm, setProviderSearchTerm] = useState("");

  // New state for dropdown visibility
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);

  // Refs for handling outside clicks
  const modelDropdownRef = useRef(null);
  const providerDropdownRef = useRef(null);

  // New ref for input
  const inputRef = useRef(null);

  // New ref for chat history
  const chatHistoryRef = useRef(null);

  // --- Effects ---

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Handle window resize for responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        // On desktop, always show sidebar
        setIsSidebarOpen(true);
      } else if (!isSidebarOpen) {
        // On mobile, keep it closed if it was closed
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isSidebarOpen]);

  // Initialize DB
  useEffect(() => {
    const initDB = async () => {
      const database = await openDB("chatDB", 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("chats")) {
            db.createObjectStore("chats", {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
      });
      setDb(database);
    };
    initDB();
  }, []);

  // Load API key from localStorage on mount
  useEffect(() => {
    const key = localStorage.getItem("openrouter_api_key");
    if (key) {
      setStoredApiKey(key);
    } else {
      setShowApiKeyModal(true);
    }
  }, []);

  // Load saved chats when DB is ready
  useEffect(() => {
    const loadChats = async () => {
      if (db) {
        const allChats = await db.getAll("chats");
        setSavedChats(
          allChats
            .map((chat) => ({
              ...chat,
              name:
                chat.name ||
                `Chat ${new Date(chat.timestamp).toLocaleString()}`,
            }))
            .sort((a, b) => b.timestamp - a.timestamp)
        );
      }
    };
    loadChats();
  }, [db]);

  // Fetch available models/providers when storedApiKey is set
  useEffect(() => {
    if (storedApiKey) {
      const fetchModels = async () => {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${storedApiKey}` },
          });

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              alert("Invalid API key. Please clear and re-enter.");
              handleClearApiKey();
            }
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          if (data && Array.isArray(data.data)) {
            // Process model data to include all necessary information
            const fetchedModels = data.data.map((model) => ({
              ...model,
              // Ensure pricing data is stored in a consistent format
              pricing: {
                prompt: model.pricing?.prompt || 0,
                completion: model.pricing?.completion || 0,
              },
              // Ensure description is available
              description: model.description || "",
            }));

            setAvailableModels(fetchedModels);

            // Extract unique providers and models for dropdowns
            const uniqueProviders = [
              ...new Set(fetchedModels.map((m) => m.id.split("/")[0])),
            ].sort();

            setAvailableProviders(uniqueProviders);

            // --- Initial Selector Setup ---
            if (selectorOrder === "providerFirst") {
              if (uniqueProviders.length > 0) {
                setSelectedProvider(uniqueProviders[0]);
              }
            } else {
              if (fetchedModels.length > 0) {
                // Try to find a good default model (GPT-3.5, or first available)
                const defaultModel =
                  fetchedModels.find((m) => m.id.includes("gpt-3.5-turbo")) ||
                  fetchedModels[0];
                if (defaultModel) {
                  setModel(defaultModel.id);
                }
              }
            }
          }
        } catch (error) {
          console.error("Error fetching models:", error);
        }
      };
      fetchModels();
    } else {
      setAvailableModels([]);
      setAvailableProviders([]);
      setModel("");
      setSelectedProvider("");
      setCurrentChatInfo({ model: "", provider: "" });
    }
  }, [storedApiKey]);

  // --- Selector Logic Effects ---

  useEffect(() => {
    if (availableModels.length === 0) return;

    if (selectorOrder === "modelFirst" && model) {
      const providersForModel = availableModels
        .filter((m) => m.id === model)
        .map((m) => m.id.split("/")[0]);

      if (providersForModel.length > 0) {
        if (!providersForModel.includes(selectedProvider)) {
          setSelectedProvider(providersForModel[0]);
        }
        setCurrentChatInfo({
          model: getModelName(model),
          provider: providersForModel[0],
        });
      } else {
        setSelectedProvider("");
        setCurrentChatInfo({ model: getModelName(model), provider: "" });
      }
    } else if (selectorOrder === "providerFirst" && selectedProvider) {
      const modelsForProvider = availableModels.filter((m) =>
        m.id.startsWith(selectedProvider + "/")
      );
      if (modelsForProvider.length > 0) {
        if (!modelsForProvider.some((m) => m.id === model)) {
          setModel(modelsForProvider[0].id);
          setCurrentChatInfo({
            model: getModelName(modelsForProvider[0].id),
            provider: selectedProvider,
          });
        } else {
          setCurrentChatInfo({
            model: getModelName(model),
            provider: selectedProvider,
          });
        }
      } else {
        setModel("");
        setCurrentChatInfo({ model: "", provider: selectedProvider });
      }
    } else if (!model && !selectedProvider) {
      setCurrentChatInfo({ model: "", provider: "" });
    }
  }, [model, selectedProvider, selectorOrder, availableModels]);

  // Calculate total cost whenever messages change
  useEffect(() => {
    let calculatedTotalCost = 0;
    messages.forEach((msg) => {
      if (
        msg.sender === "ai" &&
        msg.cost &&
        typeof msg.cost.total === "number"
      ) {
        calculatedTotalCost += msg.cost.total;
      }
    });
    setTotalCost(calculatedTotalCost);
  }, [messages]);

  // Scroll to bottom and focus input when messages change
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
    // Focus input after messages update (especially after AI response)
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [messages, isLoading]); // Add isLoading to dependency array

  // Detect clicks outside dropdowns to close them
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target)
      ) {
        setIsModelDropdownOpen(false);
      }
      if (
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(event.target)
      ) {
        setIsProviderDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  // --- Helper Functions ---
  const getModelName = (modelId) => {
    if (!modelId) return "";
    const model = availableModels.find((m) => m.id === modelId);
    return model ? model.name || model.id : modelId.split("/").pop();
  };

  const getProviderName = useCallback((modelId) => {
    if (!modelId) return "N/A";
    return modelId.split("/")[0];
  }, []);

  // --- Event Handlers ---

  const handleSaveApiKey = () => {
    localStorage.setItem("openrouter_api_key", apiKey);
    setStoredApiKey(apiKey);
    setShowApiKeyModal(false);
  };

  const handleClearApiKey = useCallback(() => {
    localStorage.removeItem("openrouter_api_key");
    setStoredApiKey("");
    setApiKey("");
    setMessages([]);
    setTotalCost(0);
    setSystemPrompt("");
    setSelectedSavedChatId("");
    setCurrentChatInfo({ model: "", provider: "" });
    setShowApiKeyModal(true);
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    if (!storedApiKey) {
      setShowApiKeyModal(true);
      return;
    }
    if (!model) {
      alert("Please select a model.");
      return;
    }

    const newUserMessage = { text: input, sender: "user" };
    if (!selectedSavedChatId && messages.length === 0) {
      setCurrentChatInfo({
        model: getModelName(model),
        provider: selectedProvider,
      });
    }

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const placeholderId = Date.now();
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: placeholderId,
        text: "",
        sender: "ai",
        cost: null,
        tokens: null,
        reasoning: null,
        generationId: null,
      },
    ]);

    const messagesForApi = [];
    if (systemPrompt.trim()) {
      messagesForApi.push({ role: "system", content: systemPrompt });
    }
    messagesForApi.push(
      ...updatedMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      }))
    );

    let generationId = null;
    let assistantMessageContent = "";
    let fetchedReasoning = null;
    let fetchedTokens = null;
    let fetchedCost = null;

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${storedApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: messagesForApi,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("API Error Response:", errorBody);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // Buffer to hold incomplete lines

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }); // Append chunk to buffer

        // Process complete lines from buffer
        let lineEndIndex;
        while ((lineEndIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, lineEndIndex).trim();
          buffer = buffer.slice(lineEndIndex + 1); // Remove processed line from buffer

          if (line.startsWith("data: ")) {
            const dataContent = line.slice("data: ".length);

            if (dataContent === "[DONE]") {
              // End of stream signal
              break; // Exit inner loop (processing lines)
            }

            try {
              const json = JSON.parse(dataContent);

              // Capture Generation ID once
              if (json.id && !generationId) {
                generationId = json.id;
                setMessages((currentMessages) =>
                  currentMessages.map((msg) =>
                    msg.id === placeholderId
                      ? { ...msg, generationId: generationId }
                      : msg
                  )
                );
              }

              // Append content delta
              if (
                json.choices &&
                json.choices[0].delta &&
                json.choices[0].delta.content
              ) {
                const deltaContent = json.choices[0].delta.content;
                assistantMessageContent += deltaContent;
                setMessages((currentMessages) =>
                  currentMessages.map((msg) =>
                    msg.id === placeholderId
                      ? { ...msg, text: assistantMessageContent }
                      : msg
                  )
                );
              }

              // Potential usage data in stream (less common, but check)
              if (json.choices && json.choices[0].usage) {
                // Note: Streaming usage might be incomplete or use non-native tokens
                // We primarily rely on the final /generation call for accurate cost/tokens
                // If you want to display *something* during stream, you could use this,
                // but it might differ from the final cost.
                // For now, we won't store this intermediate usage data.
                // fetchedTokens = json.choices[0].usage;
              }
            } catch (parseError) {
              // Ignore empty data lines or non-JSON data if necessary
              if (dataContent.trim()) {
                console.error(
                  "Error parsing stream data:",
                  parseError,
                  "Data:",
                  dataContent
                );
              }
            }
          }
        }
        // Check for [DONE] again in case it was the only thing in the last chunk
        if (buffer.includes("data: [DONE]")) {
          break; // Exit outer loop (reading chunks)
        }
      }
      // Ensure decoder buffer is flushed if stream ends without newline
      // (This part of TextDecoder handling is usually implicit with stream:true)

      reader.releaseLock();
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((currentMessages) =>
        currentMessages.map((msg) =>
          msg.id === placeholderId
            ? { ...msg, text: `Error: ${error.message}`, isError: true }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      if (generationId) {
        let retries = 0;
        while (retries < MAX_RETRIES) {
          try {
            const statsResponse = await fetch(
              `https://openrouter.ai/api/v1/generation?id=${generationId}`,
              {
                headers: { Authorization: `Bearer ${storedApiKey}` },
              }
            );
            if (statsResponse.ok) {
              const statsData = await statsResponse.json();
              if (statsData.data) {
                // Ensure cost is a number, default to 0 if missing/invalid
                const totalCostValue = Number(statsData.data.total_cost) || 0;
                const costCompletionValue =
                  Number(statsData.data.cost_completion) || 0;

                fetchedCost = {
                  total: totalCostValue,
                };

                // Ensure tokens are numbers, default to 0
                const promptTokensValue =
                  Number(statsData.data.tokens_prompt) || 0;
                const completionTokensValue =
                  Number(statsData.data.tokens_completion) || 0;

                fetchedTokens = {
                  prompt_tokens: promptTokensValue,
                  completion_tokens: completionTokensValue,
                  total_tokens: promptTokensValue + completionTokensValue,
                };

                // Reasoning might still be under 'usage', confirm API structure if needed
                fetchedReasoning = statsData.data.usage || null;

                setMessages((currentMessages) =>
                  currentMessages.map((msg) =>
                    msg.id === placeholderId ||
                    msg.generationId === generationId // Match by original placeholder OR final generationId
                      ? {
                          ...msg,
                          text: assistantMessageContent, // Ensure final content is set
                          cost: fetchedCost,
                          tokens: fetchedTokens,
                          reasoning: fetchedReasoning,
                          generationId: generationId, // Ensure final ID is set
                          id: generationId, // Update the message key/id to the final one
                        }
                      : msg
                  )
                );
                break; // Exit retry loop on success
              } else {
                // Handle cases where statsData.data is missing even with 200 OK
                console.warn(
                  "Generation stats fetched (200 OK) but data field is missing:",
                  statsData
                );
                // Optionally retry or mark as failed to fetch stats
                // For now, we'll proceed as if stats aren't available after retries
                // Fall through to retry logic
              }
            } else if (
              statsResponse.status === 404 ||
              statsResponse.status === 429
            ) {
              console.warn(
                `Generation stats not ready (status ${statsResponse.status}), retrying...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries))
              );
              retries++;
            } else {
              console.error(
                `Error fetching generation stats: ${statsResponse.status}`
              );
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === placeholderId || msg.generationId === generationId // Match by original placeholder OR final generationId
                    ? {
                        ...msg,
                        text: assistantMessageContent,
                        id: generationId || placeholderId, // Use final ID if available
                        cost: null, // Explicitly nullify cost/tokens if stats fetch failed
                        tokens: null,
                        reasoning: "Stats fetch exception after retries",
                      }
                    : msg
                )
              );
              break; // Exit retry loop on non-retryable error
            }
          } catch (statsError) {
            console.error("Error in fetch generation loop:", statsError);
            retries++;
            if (retries >= MAX_RETRIES) {
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === placeholderId || msg.generationId === generationId // Match by original placeholder OR final generationId
                    ? {
                        ...msg,
                        text: assistantMessageContent,
                        id: generationId || placeholderId, // Use final ID if available
                        cost: null, // Explicitly nullify cost/tokens if stats fetch failed
                        tokens: null,
                        reasoning: "Stats fetch exception after retries",
                      }
                    : msg
                )
              );
            } else {
              await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries))
              );
            }
          }
        }
      } else {
        // Handle case where generationId was never received from the stream
        console.error("No generationId received from stream.");
        setMessages((currentMessages) =>
          currentMessages.map((msg) =>
            msg.id === placeholderId
              ? {
                  ...msg,
                  text: assistantMessageContent,
                  id: `no-gen-id-${placeholderId}`, // Use a distinct ID
                  cost: null,
                  tokens: null,
                  reasoning: "No generation ID from stream",
                }
              : msg
          )
        );
      }
    }
  };

  const saveChat = async () => {
    if (!db || messages.length === 0) return;

    const chatName = prompt(
      "Enter a name for this chat (optional):",
      currentChatInfo.model && currentChatInfo.provider
        ? `${currentChatInfo.provider}/${currentChatInfo.model} Chat`
        : `Chat ${new Date().toLocaleString()}`
    );

    const timestamp = Date.now();
    const chatData = {
      name: chatName || `Chat ${new Date(timestamp).toLocaleString()}`,
      messages,
      systemPrompt,
      model: currentChatInfo.model,
      provider: currentChatInfo.provider,
      totalCost,
      timestamp,
      selectedModelId: model,
      selectedProviderId: selectedProvider,
    };

    try {
      if (selectedSavedChatId) {
        await db.put("chats", { ...chatData, id: selectedSavedChatId });
        setSavedChats((prevChats) =>
          prevChats
            .map((c) =>
              c.id === selectedSavedChatId
                ? { ...chatData, id: selectedSavedChatId }
                : c
            )
            .sort((a, b) => b.timestamp - a.timestamp)
        );
        alert(`Chat "${chatData.name}" updated.`);
      } else {
        const newId = await db.add("chats", chatData);
        const newChatEntry = { ...chatData, id: newId };
        setSavedChats((prevChats) =>
          [...prevChats, newChatEntry].sort((a, b) => b.timestamp - a.timestamp)
        );
        setSelectedSavedChatId(newId);
        alert(`Chat "${chatData.name}" saved.`);
      }
    } catch (error) {
      console.error("Error saving chat:", error);
      alert("Failed to save chat.");
    }
  };

  const handleLoadChat = useCallback(
    async (e) => {
      const chatId = parseInt(e.target.value, 10);
      if (!chatId || !db) {
        setSelectedSavedChatId("");
        setMessages([]);
        setSystemPrompt("");
        setTotalCost(0);
        setCurrentChatInfo({
          model: getModelName(model),
          provider: selectedProvider,
        });
        return;
      }

      try {
        const chatToLoad = await db.get("chats", chatId);
        if (chatToLoad) {
          setMessages(chatToLoad.messages);
          setSystemPrompt(chatToLoad.systemPrompt || "");
          setTotalCost(chatToLoad.totalCost || 0);
          setSelectedSavedChatId(chatId);

          const loadedModelId = chatToLoad.selectedModelId;
          const loadedProviderId = chatToLoad.selectedProviderId;

          const modelExists = availableModels.some(
            (m) => m.id === loadedModelId
          );

          if (loadedModelId && loadedProviderId && modelExists) {
            setModel(loadedModelId);
            setSelectedProvider(loadedProviderId);
            setCurrentChatInfo({
              model: chatToLoad.model || getModelName(loadedModelId),
              provider: chatToLoad.provider || loadedProviderId,
            });
          } else {
            setCurrentChatInfo({
              model: chatToLoad.model || "N/A",
              provider: chatToLoad.provider || "N/A",
            });
            if (!modelExists && loadedModelId) {
              console.warn(
                `Loaded model ${loadedModelId} is no longer available.`
              );
              setModel("");
              setSelectedProvider("");
            } else {
              setCurrentChatInfo({
                model: getModelName(model),
                provider: selectedProvider,
              });
            }
          }
        } else {
          console.error("Chat not found in DB:", chatId);
          setSelectedSavedChatId("");
        }
      } catch (error) {
        console.error("Error loading chat:", error);
        alert("Failed to load chat.");
      }
    },
    [db, availableModels, model, selectedProvider, getModelName]
  );

  const deleteChat = async (chatId) => {
    if (!db || !chatId) return;
    const chatToDelete = savedChats.find((c) => c.id === chatId);
    if (!chatToDelete) return;

    if (
      confirm(`Are you sure you want to delete chat "${chatToDelete.name}"?`)
    ) {
      try {
        await db.delete("chats", chatId);
        setSavedChats((prevChats) => prevChats.filter((c) => c.id !== chatId));

        if (selectedSavedChatId === chatId) {
          setSelectedSavedChatId("");
          setMessages([]);
          setSystemPrompt("");
          setTotalCost(0);
          setCurrentChatInfo({
            model: getModelName(model),
            provider: selectedProvider,
          });
        }
        alert(`Chat "${chatToDelete.name}" deleted.`);
      } catch (error) {
        console.error("Error deleting chat:", error);
        alert("Failed to delete chat.");
      }
    }
  };

  const startNewChat = () => {
    setSelectedSavedChatId("");
    setMessages([]);
    setSystemPrompt("");
    setTotalCost(0);
    setInput("");
    setCurrentChatInfo({
      model: getModelName(model),
      provider: selectedProvider,
    });
  };

  const getProviderOptions = () => {
    let options = availableProviders;
    if (selectorOrder === "modelFirst" && model) {
      options = availableModels
        .filter((m) => m.id === model)
        .map((m) => m.id.split("/")[0])
        .filter((value, index, self) => self.indexOf(value) === index)
        .sort();
    }
    return options.filter((p) =>
      p.toLowerCase().includes(providerSearchTerm.toLowerCase())
    );
  };

  const getModelOptions = () => {
    let options = availableModels.sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id)
    );
    if (selectorOrder === "providerFirst" && selectedProvider) {
      options = availableModels
        .filter((m) => m.id.startsWith(selectedProvider + "/"))
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    }
    return options.filter((m) =>
      (m.name || m.id).toLowerCase().includes(modelSearchTerm.toLowerCase())
    );
  };

  // Handle model selection
  const handleModelSelect = (modelId) => {
    setModel(modelId);
    setIsModelDropdownOpen(false);
    setModelSearchTerm("");
  };

  // Handle provider selection
  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider);
    setIsProviderDropdownOpen(false);
    setProviderSearchTerm("");
  };

  const ApiKeyModal = () => (
    <div className="modal-content">
      <h2>Enter Your OpenRouter API Key</h2>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-or-..."
        autoFocus
      />
      <div className="modal-buttons">
        <button onClick={() => setShowApiKeyModal(false)}>Cancel</button>
        <button
          onClick={handleSaveApiKey}
          disabled={!apiKey.trim().startsWith("sk-or-")}
        >
          Save Key
        </button>
      </div>
    </div>
  );

  const renderSelectors = () => {
    const modelOptions = getModelOptions();
    const providerOptions = getProviderOptions();

    const selectedModelName = model ? getModelName(model) : "";

    const modelSelect = (
      <div className="selector-item" ref={modelDropdownRef}>
        <label htmlFor="modelInput">Model:</label>
        <div className="dropdown-container">
          <div
            className="dropdown-header"
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
          >
            <input
              id="modelInput"
              type="text"
              placeholder={selectedModelName || "Search Models..."}
              value={modelSearchTerm}
              onChange={(e) => {
                setModelSearchTerm(e.target.value);
                if (!isModelDropdownOpen) setIsModelDropdownOpen(true);
              }}
              onFocus={() => setIsModelDropdownOpen(true)}
              disabled={!storedApiKey}
            />
            <span className="dropdown-arrow">
              {isModelDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {isModelDropdownOpen && (
            <div className="dropdown-list">
              {modelOptions.length > 0 ? (
                modelOptions.map((m) => (
                  <div
                    key={m.id}
                    className={`dropdown-item ${
                      model === m.id ? "selected" : ""
                    }`}
                    onClick={() => handleModelSelect(m.id)}
                  >
                    <div className="model-name">{m.name || m.id}</div>
                    {m.description && (
                      <div className="model-description">{m.description}</div>
                    )}
                    {m.pricing &&
                      typeof m.pricing.prompt === "number" &&
                      typeof m.pricing.completion === "number" && (
                        <div className="model-pricing">
                          Input: ${m.pricing.prompt.toFixed(6)}/token | Output:
                          ${m.pricing.completion.toFixed(6)}/token
                        </div>
                      )}
                  </div>
                ))
              ) : (
                <div className="dropdown-item no-results">
                  No models match your search
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );

    const providerSelect = (
      <div className="selector-item" ref={providerDropdownRef}>
        <label htmlFor="providerInput">Provider:</label>
        <div className="dropdown-container">
          <div
            className="dropdown-header"
            onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
          >
            <input
              id="providerInput"
              type="text"
              placeholder={selectedProvider || "Search Providers..."}
              value={providerSearchTerm}
              onChange={(e) => {
                setProviderSearchTerm(e.target.value);
                if (!isProviderDropdownOpen) setIsProviderDropdownOpen(true);
              }}
              onFocus={() => setIsProviderDropdownOpen(true)}
              disabled={!storedApiKey}
            />
            <span className="dropdown-arrow">
              {isProviderDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {isProviderDropdownOpen && (
            <div className="dropdown-list">
              {providerOptions.length > 0 ? (
                providerOptions.map((p) => (
                  <div
                    key={p}
                    className={`dropdown-item ${
                      selectedProvider === p ? "selected" : ""
                    }`}
                    onClick={() => handleProviderSelect(p)}
                  >
                    {p}
                  </div>
                ))
              ) : (
                <div className="dropdown-item no-results">
                  No providers match your search
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );

    return selectorOrder === "modelFirst" ? (
      <>
        {modelSelect}
        {providerSelect}
      </>
    ) : (
      <>
        {providerSelect}
        {modelSelect}
      </>
    );
  };

  // Toggle dark mode function
  const toggleDarkMode = () => {
    setDarkMode((prevMode) => !prevMode);
  };

  return (
    <div className={`App ${darkMode ? "dark" : ""}`}>
      {/* Modal for API Key Input */}
      {showApiKeyModal && (
        <div className={`modal-overlay ${showApiKeyModal ? "show" : ""}`}>
          <ApiKeyModal />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? "sidebar-open" : ""}`}>
        <button
          className="sidebar-close-btn mobile-only"
          onClick={() => setIsSidebarOpen(false)}
        >
          ✕
        </button>
        <h2>
          LLM Cost Calculator
          <button
            className="theme-toggle"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "🌞" : "🌙"}
          </button>
        </h2>

        <div className="api-key-section">
          {storedApiKey ? (
            <button
              onClick={handleClearApiKey}
              className="clear-key-button"
              title="Clear your OpenRouter API key from localStorage"
            >
              Clear API Key
            </button>
          ) : (
            <button
              onClick={() => setShowApiKeyModal(true)}
              title="Set your OpenRouter API key"
            >
              Set API Key
            </button>
          )}
        </div>

        <div className="saved-chats-section">
          <label htmlFor="savedChatsSelect">Saved Chats:</label>
          <select
            id="savedChatsSelect"
            value={selectedSavedChatId}
            onChange={handleLoadChat}
            disabled={savedChats.length === 0}
          >
            <option value="">-- Select a Chat --</option>
            {savedChats.map((chat) => (
              <option key={chat.id} value={chat.id}>
                {chat.name}
              </option>
            ))}
          </select>
          <div className="button-group">
            <button
              onClick={startNewChat}
              title="Clear current chat and start new"
            >
              New Chat
            </button>
            {selectedSavedChatId && (
              <button
                onClick={() => deleteChat(selectedSavedChatId)}
                className="delete-chat-button"
                title="Delete selected chat"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="selectors">{renderSelectors()}</div>

        <div className="selector-order-toggle">
          <label>
            <input
              type="checkbox"
              checked={selectorOrder === "providerFirst"}
              onChange={(e) =>
                setSelectorOrder(
                  e.target.checked ? "providerFirst" : "modelFirst"
                )
              }
              disabled={!storedApiKey}
            />
            Select Provider First If Desired Provider Is Not Listed
          </label>
        </div>

        <div className="system-prompt-section">
          <button
            onClick={() => setIsSystemPromptExpanded(!isSystemPromptExpanded)}
          >
            {isSystemPromptExpanded ? "Hide" : "Show"} System Prompt
          </button>
          {isSystemPromptExpanded && (
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt (optional)"
              rows="4"
            />
          )}
        </div>

        <button
          onClick={saveChat}
          disabled={messages.length === 0 && !selectedSavedChatId}
          title={
            selectedSavedChatId ? "Update saved chat" : "Save current chat"
          }
        >
          {selectedSavedChatId ? "Update Chat" : "Save Chat"}
        </button>
      </aside>

      {/* Sidebar Backdrop for mobile */}
      {!isSidebarOpen && window.innerWidth <= 768 && (
        <div
          className={`sidebar-backdrop ${isSidebarOpen ? "sidebar-open" : ""}`}
          onClick={() => setIsSidebarOpen(true)}
        ></div>
      )}

      <div className="chat-area">
        <div className="chat-info-bar">
          <button
            className="sidebar-toggle mobile-only"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open Sidebar"
          >
            ☰
          </button>
          <div>
            <span>
              {selectedSavedChatId
                ? `Chat: ${
                    savedChats.find((c) => c.id === selectedSavedChatId)
                      ?.name ?? "..."
                  }`
                : "New Chat"}
            </span>
            <span>
              {" "}
              | Model: {currentChatInfo.model || getModelName(model) || "N/A"}
            </span>
            <span>
              {" "}
              | Provider:{" "}
              {currentChatInfo.provider ||
                (model ? model.split("/")[0] : "N/A")}
            </span>
          </div>
          <span className="cost-display">
            Total Cost: ${totalCost.toFixed(6)}
          </span>
        </div>

        <div className="chat-history" ref={chatHistoryRef}>
          {messages.map((msg, index) => (
            <div key={msg.id || index} className={`message ${msg.sender}`}>
              <div className="message-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter
                          {...props}
                          style={darkMode ? dark : light}
                          language={match[1]}
                          PreTag="pre"
                          customStyle={{
                            background: "none",
                            padding: "0",
                          }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
              {msg.sender === "ai" && msg.cost && (
                <div className="message-info">
                  <span>Cost: ${msg.cost.total?.toFixed(6) || "N/A"}</span>
                  {msg.tokens && (
                    <span>
                      Tokens: P {msg.tokens.prompt_tokens ?? "N/A"} / C{" "}
                      {msg.tokens.completion_tokens ?? "N/A"}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message ai">
              <div className="message-content">
                <div className="loading-indicator">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message... (Shift+Enter for newline)"
            rows="3"
            disabled={isLoading || !model || !storedApiKey}
            style={{ overflow: "hidden" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim() || !model || !storedApiKey}
          >
            {isLoading ? (
              "Sending..."
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
