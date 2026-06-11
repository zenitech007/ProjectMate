
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  GraduationCap,
  FileText,
  Zap,
  ShieldCheck,
  Globe,
  Download,
  Clock,
  Sparkles,
  BookOpen,
  Layout,
  PenTool,
  Twitter,
  Instagram,
  Mail,
  ArrowRight
} from 'lucide-react';
import { PREMIUM_PRICE_NGN } from '../../constants';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStart = () => navigate('/auth');

  return (
    <div className="bg-[#fdfdfb] overflow-x-hidden font-['Inter']">
      {/* Hero Section */}
      <section className="relative pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 bg-green-50 text-[#1a4731] px-4 py-1.5 rounded-full mb-8 border border-green-100 shadow-sm">
            <Sparkles className="h-4 w-4 text-green-600" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">AI-Powered Academic Writing</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold text-[#1a4731] mb-8 leading-[1.1] font-['Playfair_Display'] max-w-4xl mx-auto">
            Finish Your Final Year Project in <span className="text-[#2d6a4f] italic underline decoration-[#facc15]/30 underline-offset-8">Hours</span>, Not Months
          </h1>

          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            ProjectMate generates professional, publication-ready research projects that strictly follow the <strong>Nigerian University Format</strong>. APA 7th Edition, double spacing, and all formatting handled automatically.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={handleStart}
              className="w-full sm:w-auto bg-[#1a4731] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#153a28] transition-all flex items-center justify-center group shadow-xl shadow-green-900/10"
            >
              Start Your Project Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto border border-slate-300 text-slate-700 px-8 py-4 rounded-lg font-bold text-lg hover:bg-slate-50 transition-all"
            >
              See How It Works
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-slate-500">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Nigerian Format Compliant</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>APA 7th Edition</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Export to Word/PDF</span>
            </div>
          </div>

          {/* Editor Mockup */}
          <div className="mt-20 relative max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform hover:-translate-y-1 transition-transform duration-500">
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center space-x-2">
                <div className="flex space-x-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">ProjectMate Editor</div>
              </div>
              <div className="flex flex-col md:flex-row h-100 md:h-112.5">
                <div className="w-full md:w-1/4 bg-slate-50 border-r border-slate-100 p-4 space-y-3">
                  <div className="text-[9px] font-black text-slate-300 uppercase mb-4 tracking-widest">Chapters</div>
                  <div className="h-9 bg-[#1a4731] rounded-lg w-full flex items-center px-3">
                    <div className="text-[10px] text-white font-bold">Chapter 1: Introduction</div>
                  </div>
                  <div className="h-9 bg-white border border-slate-100 rounded-lg w-full flex items-center px-3">
                    <div className="text-[10px] text-slate-400 font-medium">Chapter 2: Literature Review</div>
                  </div>
                  <div className="h-9 bg-white border border-slate-100 rounded-lg w-full flex items-center px-3">
                    <div className="text-[10px] text-slate-400 font-medium">Chapter 3: Methodology</div>
                  </div>
                  <div className="h-9 bg-white border border-slate-100 rounded-lg w-full flex items-center px-3">
                    <div className="text-[10px] text-slate-400 font-medium">Chapter 4: Data Analysis</div>
                  </div>
                  <div className="h-9 bg-white border border-slate-100 rounded-lg w-full flex items-center px-3">
                    <div className="text-[10px] text-slate-400 font-medium">Chapter 5: Conclusion</div>
                  </div>
                </div>
                <div className="flex-1 p-8 text-left bg-white relative overflow-hidden">
                  <div className="text-[9px] font-black text-slate-300 uppercase mb-4 tracking-widest">Preview</div>
                  <h3 className="text-xl font-bold mb-4 font-['Playfair_Display']">1.1 Background of the Study</h3>
                  <div className="space-y-4">
                    <div className="h-3 bg-slate-100 rounded-full w-full"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-[95%]"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-[98%]"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-[80%]"></div>
                  </div>
                  <h3 className="text-xl font-bold mb-4 mt-12 font-['Playfair_Display']">1.2 Statement of the Problem</h3>
                  <div className="space-y-4">
                    <div className="h-3 bg-slate-100 rounded-full w-full"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-[95%]"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-[70%]"></div>
                  </div>
                </div>
              </div>
            </div>
            {/* Background elements */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-green-200/20 rounded-full blur-3xl -z-10"></div>
            <div className="absolute -bottom-10 -right-10 w-60 h-60 bg-yellow-100/20 rounded-full blur-3xl -z-10"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-slate-100 text-slate-800 px-4 py-1 rounded-full mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Playfair_Display']">Everything You Need to Complete Your Project</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Built specifically for Nigerian universities. Every feature designed to meet academic standards.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Sparkles className="h-6 w-6 text-green-700" />}
              title="AI-Powered Generation"
              desc="Advanced AI trained on Nigerian academic standards generates publication-ready content chapter by chapter."
            />
            <FeatureCard
              icon={<FileText className="h-6 w-6 text-blue-700" />}
              title="Nigerian Format Compliant"
              desc="Times New Roman, 12pt, double spacing, 1-inch margins. All formatting rules applied automatically."
            />
            <FeatureCard
              icon={<Layout className="h-6 w-6 text-purple-700" />}
              title="Complete Structure"
              desc="From Title Page to References. All 5 chapters with proper sections, subsections, and APA 7th citations."
            />
            <FeatureCard
              icon={<Download className="h-6 w-6 text-red-700" />}
              title="Export to Word & PDF"
              desc="Download your project in Microsoft Word format (.docx) or PDF, ready for submission."
            />
            <FeatureCard
              icon={<Clock className="h-6 w-6 text-orange-700" />}
              title="Save Weeks of Work"
              desc="What normally takes weeks or months can be completed in hours with intelligent AI assistance."
            />
            <FeatureCard
              icon={<GraduationCap className="h-6 w-6 text-emerald-700" />}
              title="Department Specific"
              desc="Topics and content tailored to your specific faculty and department requirements."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-6 w-6 text-indigo-700" />}
              title="Original Content"
              desc="Each project is uniquely generated. No plagiarism concerns with original, researched content."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6 text-yellow-600" />}
              title="Instant Topic Ideas"
              desc="Get 5 trending, relevant research topics for your department with one click."
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 bg-[#f9fafb]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-flex items-center space-x-2 bg-slate-100 text-slate-800 px-4 py-1 rounded-full mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">How It Works</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Playfair_Display']">From Zero to Submission in 4 Simple Steps</h2>
          <p className="text-slate-500 max-w-2xl mx-auto mb-20">No more sleepless nights. No more writer's block. Just follow these steps.</p>

          <div className="max-w-4xl mx-auto space-y-8 relative">
            {/* Connector line */}
            <div className="absolute left-10 md:left-1/2 top-10 bottom-10 w-0.5 bg-slate-200 z-0 hidden md:block"></div>

            <StepCard
              num="01"
              icon={<PenTool className="h-6 w-6" />}
              title="Choose Your Topic"
              desc="Select your faculty and department. Our AI generates 5 trending research topics tailored to Nigerian context. Pick one or enter your own."
            />
            <StepCard
              num="02"
              icon={<BookOpen className="h-6 w-6" />}
              title="Review the Outline"
              desc="See your project structure with all chapters and sections. The Table of Contents follows the standard Nigerian university format."
            />
            <StepCard
              num="03"
              icon={<Sparkles className="h-6 w-6" />}
              title="Generate Chapters"
              desc="Watch as AI writes each chapter with proper academic language, local context (Nigerian names, cities, Naira), and APA citations."
            />
            <StepCard
              num="04"
              icon={<Download className="h-6 w-6" />}
              title="Download & Submit"
              desc="Export your complete project as a properly formatted Word document or PDF. Ready for submission to your supervisor."
            />
          </div>

          <div className="mt-16">
            <button
              onClick={handleStart}
              className="bg-[#1a4731] text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-[#153a28] transition-all shadow-xl shadow-green-900/10 inline-flex items-center"
            >
              Start Your Project Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-yellow-50 text-yellow-800 px-4 py-1 rounded-full mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Pricing</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Playfair_Display']">Simple, Transparent Pricing</h2>
            <p className="text-slate-500">Pay once, get your complete project. No hidden fees. No subscriptions.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Card */}
            <div className="bg-white p-6 sm:p-10 rounded-3xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center hover:shadow-md transition-shadow">
              <div className="bg-slate-50 p-4 rounded-full mb-6">
                <Sparkles className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Free</h3>
              <div className="text-4xl font-black text-slate-900 mb-2">₦0</div>
              <p className="text-slate-400 text-sm mb-8">Perfect for getting started</p>

              <ul className="w-full space-y-4 mb-10">
                <PricingItem text="5 AI-generated topic suggestions" />
                <PricingItem text="Complete project outline" />
                <PricingItem text="Chapter 1 (Introduction) generation" />
                <PricingItem text="Preview all chapters" />
                <PricingItem text="Basic formatting" />
                <PricingItem text="Cannot export full project" disabled />
                <PricingItem text="No Word/PDF download" disabled />
              </ul>

              <button
                onClick={handleStart}
                className="w-full py-4 border-2 border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all"
              >
                Start Free
              </button>
            </div>

            {/* Premium Card */}
            <div className="bg-[#1a4731] p-6 sm:p-10 rounded-3xl sm:rounded-[2.5rem] shadow-2xl flex flex-col items-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-[#facc15] text-[#1a4731] px-6 py-1.5 rounded-bl-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">
                👑 Most Popular
              </div>
              <div className="bg-[#ffffff10] p-4 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Premium</h3>
              <div className="text-4xl font-black text-white mb-2">₦{PREMIUM_PRICE_NGN.toLocaleString()} <span className="text-sm font-normal text-green-200">per project</span></div>
              <p className="text-green-200 text-sm mb-8">Everything you need to graduate</p>

              <ul className="w-full space-y-4 mb-10">
                <PricingItem text="Everything in Free, plus:" premium />
                <PricingItem text="All 5 chapters generated" premium />
                <PricingItem text="Preliminary pages included" premium />
                <PricingItem text="References in APA 7th format" premium />
                <PricingItem text="Export to Word (.docx)" premium />
                <PricingItem text="Export to PDF" premium />
                <PricingItem text="Nigerian format compliant" premium />
                <PricingItem text="Double spacing & proper fonts" premium />
                <PricingItem text="Priority support" premium />
              </ul>

              <button
                onClick={handleStart}
                className="w-full py-4 bg-[#facc15] text-[#1a4731] rounded-xl font-black text-lg hover:bg-[#eab308] transition-all shadow-xl shadow-yellow-900/20"
              >
                Get Premium
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-12 max-w-md mx-auto leading-relaxed">
            Secure payment powered by Paystack. Your project is saved automatically. Pay only when you're ready to export.
          </p>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="p-8 rounded-2xl border border-slate-50 bg-white shadow-sm hover:shadow-xl hover:border-green-100 transition-all group">
    <div className="bg-slate-50 p-4 rounded-xl w-fit mb-6 group-hover:scale-110 transition-transform duration-300">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-[#1a4731] transition-colors">{title}</h3>
    <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
  </div>
);

const StepCard = ({ num, icon, title, desc }: { num: string, icon: React.ReactNode, title: string, desc: string }) => (
  <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 relative z-10 group">
    <div className="shrink-0 w-16 h-16 md:w-20 md:h-20 bg-[#1a4731] text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:rotate-3 transition-transform">
      {icon}
    </div>
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-slate-100 text-left flex-1 hover:shadow-xl transition-shadow w-full">
      <div className="flex items-center space-x-3 mb-2">
        <span className="text-xs font-black text-green-700 uppercase tracking-widest">{num}</span>
        <h3 className="text-xl font-bold text-slate-900 font-serif">{title}</h3>
      </div>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

const PricingItem = ({ text, premium = false, disabled = false }: { text: string, premium?: boolean, disabled?: boolean }) => (
  <li className={`flex items-start space-x-3 text-sm ${disabled ? 'opacity-40 line-through text-slate-400' : ''}`}>
    <div className={`mt-0.5 p-0.5 rounded-full ${premium ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'}`}>
      <Check className="h-3 w-3" />
    </div>
    <span className={premium ? 'text-green-50' : 'text-slate-600'}>{text}</span>
  </li>
);

const Footer = () => {
  const navigate = useNavigate();
  return (
  <footer className="bg-[#0e271b] text-white pt-20 pb-10">
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-1">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-green-600 p-2 rounded-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter">ProjectMate</span>
          </div>
          <p className="text-green-100/60 text-sm leading-relaxed mb-8">
            The AI-powered assistant for Nigerian undergraduate students. Finish your final year project in hours, not months.
          </p>
          <div className="flex items-center space-x-4">
            <a href="https://twitter.com/projectmate_ng" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full bg-green-900/50 hover:bg-green-600 transition-colors text-green-100/60 hover:text-white">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="https://instagram.com/projectmate_ng" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full bg-green-900/50 hover:bg-green-600 transition-colors text-green-100/60 hover:text-white">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="mailto:support@projectmate.com.ng" className="p-2.5 rounded-full bg-green-900/50 hover:bg-green-600 transition-colors text-green-100/60 hover:text-white">
              <Mail className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="md:pl-12">
          <h4 className="font-bold text-sm uppercase tracking-widest text-green-500 mb-6">Quick Links</h4>
          <ul className="space-y-4 text-sm text-green-100/60">
            <li><button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Features</button></li>
            <li><button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Pricing</button></li>
            <li><button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">How It Works</button></li>
            <li><a href="#/auth" className="hover:text-white transition-colors">Sign In</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm uppercase tracking-widest text-green-500 mb-6">Legal</h4>
          <ul className="space-y-4 text-sm text-green-100/60">
            <li><button onClick={() => navigate('/legal/terms')} className="hover:text-white transition-colors">Terms of Service</button></li>
            <li><button onClick={() => navigate('/legal/privacy')} className="hover:text-white transition-colors">Privacy Policy</button></li>
            <li><button onClick={() => navigate('/legal/refund')} className="hover:text-white transition-colors">Refund Policy</button></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm uppercase tracking-widest text-green-500 mb-6">Support</h4>
          <p className="text-green-100/60 text-xs mb-6 leading-relaxed">Have questions or need help? Contact our academic support team.</p>
          <a href="mailto:support@projectmate.com.ng" className="flex items-center space-x-2 text-green-100/60 hover:text-white transition-colors">
            <Mail className="h-4 w-4" />
            <span className="text-sm">support@projectmate.com.ng</span>
          </a>
        </div>
      </div>

      <div className="pt-10 border-t border-green-900/50 flex flex-col md:flex-row items-center justify-between text-[11px] text-green-100/40">
        <p>© {new Date().getFullYear()} ProjectMate. All rights reserved.</p>
        <p className="mt-4 md:mt-0 flex items-center">
          Made with <span className="text-green-500 mx-1">💚</span> for Nigerian Students
        </p>
      </div>

      {/* Academic Disclaimer */}
      <div className="mt-8 text-center border-t border-green-900/20 pt-8">
        <p className="text-[10px] text-green-100/20 max-w-2xl mx-auto italic leading-relaxed uppercase tracking-widest">
          Disclaimer: This document is intended to serve as a guide and source material. Students are expected to review, edit, and defend their own work.
        </p>
      </div>
    </div>
  </footer>
  );
};

export default LandingPage;
