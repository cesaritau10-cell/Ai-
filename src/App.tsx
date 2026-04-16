import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { ShieldCheck, Image as ImageIcon, Video, Upload, Loader2, FileSearch, ChevronRight, AlertTriangle, Clapperboard, Share2, Check } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AnalysisResult {
  probability: number;
  justification: string;
  artifacts: string[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageResult, setImageResult] = useState<AnalysisResult | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoResult, setVideoResult] = useState<AnalysisResult | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isYoutubeWarning, setIsYoutubeWarning] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Share State
  const [copiedState, setCopiedState] = useState<'image' | 'video' | null>(null);

  const handleShare = async (result: AnalysisResult, type: 'image' | 'video') => {
    const text = `AI Authenticator 🕵️‍♂️\n\nProbabilidade de ser IA: ${result.probability}%\n\nJustificativa: ${result.justification}\n\nArtefatos detectados: ${result.artifacts.length > 0 ? result.artifacts.join(', ') : 'Nenhum'}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Resultado da Análise - AI Authenticator',
          text: text,
        });
      } catch (err) {
        console.error('Erro ao compartilhar:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedState(type);
        setTimeout(() => setCopiedState(null), 2000);
      } catch (err) {
        console.error('Erro ao copiar:', err);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    e.preventDefault();
    let file: File | undefined;
    
    if ('dataTransfer' in e) {
      file = e.dataTransfer.files?.[0];
    } else {
      file = e.target.files?.[0];
    }

    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImageError(null);
      setImageResult(null);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    e.preventDefault();
    let file: File | undefined;
    
    if ('dataTransfer' in e) {
      file = e.dataTransfer.files?.[0];
    } else {
      file = e.target.files?.[0];
    }

    if (file && file.type.startsWith('video/')) {
      if (file.size > 100 * 1024 * 1024) {
        setVideoError('Vídeo muito grande. O limite é de 100MB para análise via navegador.');
        return;
      }
      setVideoFile(file);
      setVideoError(null);
      setVideoResult(null);
      setIsYoutubeWarning(false);
      setVideoUrl('');
      setIsUploadingVideo(true);
      setVideoUploadProgress(0);

      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setVideoUploadProgress(progress);
        }
      };
      reader.onloadend = () => {
        setVideoPreview(reader.result as string);
        setIsUploadingVideo(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeMedia = async (type: 'image' | 'video') => {
    const file = type === 'image' ? imageFile : videoFile;
    const setAnalyzing = type === 'image' ? setIsAnalyzingImage : setIsAnalyzingVideo;
    const setResult = type === 'image' ? setImageResult : setVideoResult;
    const setError = type === 'image' ? setImageError : setVideoError;

    if (type === 'video' && videoUrl) {
      const ytMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      if (ytMatch) {
        setIsYoutubeWarning(true);
        setResult(null);
        setError(null);
        return;
      } else {
        setError('URL do YouTube inválida. Use o formato: https://youtube.com/watch?v=...');
        return;
      }
    }

    if (!file) {
      setError('Por favor, selecione um arquivo para analisar.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setIsYoutubeWarning(false);

    let statusInterval: NodeJS.Timeout | null = null;
    if (type === 'video') {
      const statuses = [
        'Extraindo frames do vídeo...',
        'Analisando consistência temporal...',
        'Verificando artefatos de compressão...',
        'Processando áudio e sincronia labial...',
        'Finalizando análise com IA...'
      ];
      let statusIndex = 0;
      setAnalysisStatus(statuses[0]);
      statusInterval = setInterval(() => {
        statusIndex = (statusIndex + 1) % statuses.length;
        setAnalysisStatus(statuses[statusIndex]);
      }, 2500);
    } else {
      setAnalysisStatus('Processando análise visual...');
    }

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const promptText = type === 'image' 
        ? "Analise esta imagem em busca de sinais de geração por IA. Procure distorções, padrões não naturais, inconsistências. Retorne JSON com probability (0-100), justification e artifacts (array de strings)."
        : "Analise este vídeo em busca de sinais de geração por IA (deepfake, animação sintética, etc). Considere consistência temporal, artefatos de compressão anormais, sincronia labial, reflexos. Retorne JSON com probability (0-100), justification e artifacts (array de strings).";

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          { inlineData: { data: base64Data, mimeType: file.type } },
          { text: promptText }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              probability: { type: Type.NUMBER },
              justification: { type: Type.STRING },
              artifacts: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["probability", "justification", "artifacts"]
          }
        }
      });

      if (!response.text) throw new Error("Falha ao analisar a mídia.");
      
      const result: AnalysisResult = JSON.parse(response.text);
      setResult(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocorreu um erro durante a análise.");
    } finally {
      if (statusInterval) clearInterval(statusInterval);
      setAnalyzing(false);
    }
  };

  const renderResult = (result: AnalysisResult | null, isAnalyzing: boolean, type: 'image' | 'video') => {
    if (isAnalyzing) {
      return (
        <div className="border border-neutral-800 rounded-2xl bg-neutral-900/30 p-8 flex flex-col items-center justify-center text-center min-h-[300px] h-full">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <p className="text-neutral-300 font-medium">{analysisStatus}</p>
          {type === 'video' && (
            <div className="mt-6 w-full max-w-xs bg-neutral-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-full w-full animate-[pulse_2s_ease-in-out_infinite] origin-left"></div>
            </div>
          )}
        </div>
      );
    }

    if (type === 'video' && isYoutubeWarning) {
      return (
        <div className="border border-neutral-800 rounded-2xl bg-neutral-900/30 p-8 flex flex-col items-center justify-center text-center min-h-[300px] h-full">
          <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl max-w-md">
            <AlertTriangle className="w-8 h-8 text-amber-500 mb-3 mx-auto" />
            <p className="font-medium text-amber-200 mb-2">Recurso Limitado</p>
            <p className="text-sm text-amber-300/80">
              A API não pode baixar vídeos do YouTube diretamente por motivos de segurança e direitos autorais. Recomendamos fazer o upload do arquivo de vídeo diretamente para uma análise completa.
            </p>
          </div>
        </div>
      );
    }

    if (!result) {
      return (
        <div className="border border-neutral-800 rounded-2xl bg-neutral-900/30 p-8 flex flex-col items-center justify-center text-center min-h-[300px] h-full">
          {type === 'image' ? (
            <ImageIcon className="w-12 h-12 text-neutral-700 mb-4" />
          ) : (
            <Clapperboard className="w-12 h-12 text-neutral-700 mb-4" />
          )}
          <p className="text-neutral-400">O resultado da análise aparecerá aqui.</p>
        </div>
      );
    }

    const colorClass = result.probability <= 30 ? 'text-emerald-500' : (result.probability <= 70 ? 'text-amber-500' : 'text-rose-500');
    const bgClass = result.probability <= 30 ? 'bg-emerald-500/10 border-emerald-500/20' : (result.probability <= 70 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20');

    return (
      <div className="border border-neutral-800 rounded-2xl bg-neutral-900/30 p-6 sm:p-8 flex flex-col h-full animate-in fade-in duration-500">
        <div className="space-y-6 w-full">
          <div className={`p-6 border rounded-2xl text-center ${bgClass}`}>
            <p className="text-sm font-medium text-neutral-300 mb-2">Probabilidade de ser IA</p>
            <div className="flex items-baseline justify-center gap-1">
              <p className={`text-6xl font-bold ${colorClass}`}>{result.probability}</p>
              <span className={`text-2xl font-medium ${colorClass}`}>%</span>
            </div>
          </div>
          
          <div className="p-6 border border-neutral-800 rounded-2xl bg-neutral-900/50">
            <h3 className="text-sm font-medium text-neutral-300 mb-3">Justificativa</h3>
            <p className="text-sm text-neutral-300 leading-relaxed">{result.justification}</p>
          </div>

          {result.artifacts && result.artifacts.length > 0 && (
            <div className="p-6 border border-neutral-800 rounded-2xl bg-neutral-900/50">
              <h3 className="text-sm font-medium text-neutral-300 mb-3">Artefatos Detectados</h3>
              <ul className="space-y-3">
                {result.artifacts.map((artifact, idx) => (
                  <li key={idx} className="flex gap-3 text-sm text-neutral-400 items-start">
                    <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <span>{artifact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => handleShare(result, type)}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-medium transition-colors border border-neutral-700 hover:border-neutral-600"
            >
              {copiedState === type ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
              {copiedState === type ? 'Copiado para a área de transferência!' : 'Compartilhar Resultado'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-10 border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Authenticator</h1>
          </div>
          <span className="sm:ml-auto text-xs bg-neutral-800/80 border border-neutral-700 px-3 py-1.5 rounded-full text-neutral-300 font-medium">
            v2.0 • Imagem & Vídeo
          </span>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-neutral-800">
          <button 
            onClick={() => setActiveTab('image')}
            className={`px-5 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'image' 
                ? 'border-b-2 border-indigo-500 text-indigo-400' 
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 rounded-t-lg'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Imagem
          </button>
          <button 
            onClick={() => setActiveTab('video')}
            className={`px-5 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'video' 
                ? 'border-b-2 border-indigo-500 text-indigo-400' 
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 rounded-t-lg'
            }`}
          >
            <Video className="w-4 h-4" />
            Vídeo
          </button>
        </div>

        {/* Image Section */}
        {activeTab === 'image' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-medium mb-1 text-neutral-100">Verificação de Imagem</h2>
                <p className="text-neutral-400 text-sm">Faça upload de uma imagem para análise de geração por IA.</p>
              </div>
              
              <div 
                className="border-2 border-dashed border-neutral-700 bg-neutral-900/30 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all min-h-[300px] flex flex-col items-center justify-center relative overflow-hidden group"
                onClick={() => imageInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleImageUpload}
              >
                <input 
                  type="file" 
                  ref={imageInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                
                {imagePreview ? (
                  <div className="absolute inset-0 p-4 bg-neutral-900/80 backdrop-blur-sm flex items-center justify-center">
                    <img src={imagePreview} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white font-medium bg-black/60 px-4 py-2 rounded-lg backdrop-blur-md">Clique para trocar</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                    </div>
                    <p className="font-medium text-neutral-200 text-lg">Clique ou arraste uma imagem</p>
                    <p className="text-sm text-neutral-500 mt-2">JPG, PNG, WEBP</p>
                  </div>
                )}
              </div>

              {imageError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{imageError}</p>
                </div>
              )}

              <button 
                onClick={() => analyzeMedia('image')}
                disabled={!imageFile || isAnalyzingImage}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
              >
                {isAnalyzingImage ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Analisando...</>
                ) : (
                  <><FileSearch className="w-5 h-5" /> Analisar Imagem</>
                )}
              </button>
            </div>

            <div className="h-full">
              {renderResult(imageResult, isAnalyzingImage, 'image')}
            </div>
          </div>
        )}

        {/* Video Section */}
        {activeTab === 'video' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-medium mb-1 text-neutral-100">Verificação de Vídeo</h2>
                <p className="text-neutral-400 text-sm">Cole um link do YouTube ou faça upload de um vídeo curto.</p>
              </div>
              
              <div className="space-y-5">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Video className="h-5 w-5 text-neutral-500" />
                  </div>
                  <input 
                    type="text" 
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      if (e.target.value) setVideoFile(null);
                    }}
                    placeholder="https://youtube.com/watch?v=..." 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-11 pr-4 py-4 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-neutral-200 placeholder:text-neutral-600"
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="h-px bg-neutral-800 flex-1"></div>
                  <span className="text-neutral-500 text-sm font-medium uppercase tracking-wider">ou</span>
                  <div className="h-px bg-neutral-800 flex-1"></div>
                </div>

                <div 
                  className="border-2 border-dashed border-neutral-700 bg-neutral-900/30 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group"
                  onClick={() => videoInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleVideoUpload}
                >
                  <input 
                    type="file" 
                    ref={videoInputRef} 
                    className="hidden" 
                    accept="video/*"
                    onChange={handleVideoUpload}
                  />
                  
                  {isUploadingVideo ? (
                    <div className="flex flex-col items-center py-8 w-full max-w-xs mx-auto">
                      <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                      <p className="font-medium text-neutral-200 mb-2">Carregando vídeo...</p>
                      <div className="w-full bg-neutral-800 rounded-full h-2.5 mb-2 overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300" 
                          style={{ width: `${videoUploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-neutral-400">{videoUploadProgress}%</p>
                    </div>
                  ) : videoPreview && !videoUrl ? (
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video src={videoPreview} controls className="w-full max-h-48 object-contain" />
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-md text-xs font-medium text-white cursor-pointer hover:bg-black/80">
                        Trocar vídeo
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-4">
                      <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Clapperboard className="w-8 h-8 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                      </div>
                      <p className="font-medium text-neutral-200 text-lg">Clique ou arraste um vídeo</p>
                      <p className="text-sm text-neutral-500 mt-2">MP4, MOV, AVI (máx 100MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {videoError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{videoError}</p>
                </div>
              )}

              <button 
                onClick={() => analyzeMedia('video')}
                disabled={(!videoFile && !videoUrl) || isAnalyzingVideo}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
              >
                {isAnalyzingVideo ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Analisando Vídeo...</>
                ) : (
                  <><FileSearch className="w-5 h-5" /> Analisar Vídeo</>
                )}
              </button>
            </div>

            <div className="h-full">
              {renderResult(videoResult, isAnalyzingVideo, 'video')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

