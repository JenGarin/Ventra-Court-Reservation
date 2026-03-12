import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Trophy, Users, CheckCircle, ChevronDown, Twitter, Facebook, Instagram, Linkedin, Mail, Phone, MapPin, Star, ChevronLeft, ChevronRight, PlayCircle, Activity, Plus, Minus, Send, CreditCard, Shield, BarChart3, Award, BookOpen, HelpCircle, Code2, Building2, Briefcase, MessageCircleQuestion } from 'lucide-react';

const TESTIMONIALS = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Tennis Coach",
    content: "Ventra has completely transformed how I manage my coaching sessions. The booking system is intuitive and my clients love it!",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop"
  },
  {
    id: 2,
    name: "Michael Chen",
    role: "League Organizer",
    content: "Organizing our local basketball league used to be a nightmare of spreadsheets. Now everything is automated and seamless.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop"
  },
  {
    id: 3,
    name: "David Miller",
    role: "Pro Player",
    content: "The best platform for finding and booking high-quality courts. I use it every time I travel for tournaments.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150&auto=format&fit=crop"
  }
];

const STATS = [
  { label: "Active Players", value: "10k+" },
  { label: "Partner Venues", value: "50+" },
  { label: "Games Played", value: "100k+" },
  { label: "Average Rating", value: "4.9/5" },
];

const FAQS = [
  {
    question: "How do I book a court?",
    answer: "Simply sign up for an account, choose your preferred facility, select a date and time, and confirm your booking. You'll receive an instant confirmation."
  },
  {
    question: "Can I cancel my booking?",
    answer: "Yes, you can cancel up to 24 hours before your scheduled time for a full refund. Cancellations within 24 hours may be subject to a fee."
  },
  {
    question: "Is there a membership fee?",
    answer: "Ventra is free to use for browsing and booking. Some facilities may offer their own membership plans for discounted rates."
  },
  {
    question: "What payment methods are accepted?",
    answer: "We accept all major credit cards, debit cards, and digital wallets like PayPal and Apple Pay."
  }
];

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1626244304102-ef2ed31d3e21?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1000&auto=format&fit=crop"
];

export function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentHeroImage, setCurrentHeroImage] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToFAQ = () => {
    faqRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setIsVisible(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);

    const timer = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (isHeroHovered) return;
    const heroTimer = setInterval(() => {
      setCurrentHeroImage((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 4000);
    return () => clearInterval(heroTimer);
  }, [isHeroHovered]);

  const nextHeroImage = () => setCurrentHeroImage((prev) => (prev + 1) % HERO_IMAGES.length);
  const prevHeroImage = () => setCurrentHeroImage((prev) => (prev - 1 + HERO_IMAGES.length) % HERO_IMAGES.length);

  return (
    <div className="min-h-screen bg-teal-50 selection:bg-teal-100 selection:text-teal-900 font-sans relative">
      {/* Global Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-teal-100/50 mix-blend-multiply z-10"></div>
        <img src="/landing-bg.jpg" alt="" className="w-full h-full object-cover opacity-15" />
      </div>

      <div className="relative z-10">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/80 backdrop-blur-md shadow-sm border-b border-teal-100 py-4' 
          : 'bg-transparent py-6'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex items-center gap-2 group cursor-pointer">
              <img src="/ventra-logo.png" alt="Ventra" className="h-20 md:h-24 w-auto group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors">
                Log In
              </Link>
              <Link 
                to="/login" 
                className="px-4 py-2 md:px-5 md:py-2.5 bg-teal-600 text-white rounded-xl text-xs md:text-sm font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 hover:shadow-teal-300 hover:-translate-y-0.5 whitespace-nowrap"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-8 hidden lg:flex">
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors py-2">
                Platform <ChevronDown size={16} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-0 w-64 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 overflow-hidden">
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center text-teal-600 group-hover/item:bg-teal-600 group-hover/item:text-white transition-colors">
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Pricing & Payments</div>
                      <div className="text-xs text-slate-500">Secure transactions</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600 group-hover/item:bg-purple-600 group-hover/item:text-white transition-colors">
                      <Shield size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Rules & Role Engine</div>
                      <div className="text-xs text-slate-500">Custom permissions</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 group-hover/item:bg-orange-600 group-hover/item:text-white transition-colors">
                      <BarChart3 size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Analytics & Reporting</div>
                      <div className="text-xs text-slate-500">Data-driven insights</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 group-hover/item:bg-blue-600 group-hover/item:text-white transition-colors">
                      <Award size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Membership</div>
                      <div className="text-xs text-slate-500">Loyalty programs</div>
                    </div>
                  </a>
                  <button onClick={scrollToFAQ} className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 group-hover/item:bg-indigo-600 group-hover/item:text-white transition-colors">
                      <MessageCircleQuestion size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">FAQs</div>
                      <div className="text-xs text-slate-500">Common questions</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors py-2">
                Solutions <ChevronDown size={16} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-0 w-64 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 overflow-hidden">
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 group-hover/item:bg-blue-600 group-hover/item:text-white transition-colors">
                      <Activity size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">For Players</div>
                      <div className="text-xs text-slate-500">Find courts & games</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 group-hover/item:bg-indigo-600 group-hover/item:text-white transition-colors">
                      <Star size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">For Coaches</div>
                      <div className="text-xs text-slate-500">Manage sessions</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-colors">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">For Venue Owners</div>
                      <div className="text-xs text-slate-500">Maximize bookings</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors py-2">
                Resources <ChevronDown size={16} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-0 w-64 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 overflow-hidden">
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-pink-50 rounded-lg flex items-center justify-center text-pink-600 group-hover/item:bg-pink-600 group-hover/item:text-white transition-colors">
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Blog</div>
                      <div className="text-xs text-slate-500">Latest news & tips</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center text-cyan-600 group-hover/item:bg-cyan-600 group-hover/item:text-white transition-colors">
                      <HelpCircle size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Help Center</div>
                      <div className="text-xs text-slate-500">Guides & support</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600 group-hover/item:bg-slate-600 group-hover/item:text-white transition-colors">
                      <Code2 size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">API Docs</div>
                      <div className="text-xs text-slate-500">For developers</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors py-2">
                Company <ChevronDown size={16} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-0 w-64 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 overflow-hidden">
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 group-hover/item:bg-amber-600 group-hover/item:text-white transition-colors">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">About Us</div>
                      <div className="text-xs text-slate-500">Our story & mission</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center text-violet-600 group-hover/item:bg-violet-600 group-hover/item:text-white transition-colors">
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Careers</div>
                      <div className="text-xs text-slate-500">Join our team</div>
                    </div>
                  </a>
                  <a href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 group-hover/item:bg-rose-600 group-hover/item:text-white transition-colors">
                      <Mail size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Contact</div>
                      <div className="text-xs text-slate-500">Get in touch</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
            <a href="#" className="text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors">Pricing</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className={`relative pt-20 pb-32 overflow-hidden transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 text-center lg:text-left max-w-2xl">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/75 backdrop-blur-sm text-teal-700 text-sm font-semibold tracking-wide mt-12 md:mt-14 mb-8 border border-teal-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                THE #1 COURT BOOKING PLATFORM
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 leading-[1.1] mb-8 tracking-tight animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                Book Your Perfect <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-600">Game Court</span> in Seconds
              </h1>
              <p className="text-xl text-slate-600 mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                Discover and reserve top-rated sports facilities near you. From tennis to basketball, Ventra makes managing your games effortless and fun.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                <Link 
                  to="/sign-in" 
                  className="w-full sm:w-auto px-8 py-4 bg-teal-600 text-white rounded-xl font-bold text-lg hover:bg-teal-700 transition-all shadow-xl shadow-teal-200 hover:shadow-2xl hover:shadow-teal-300 hover:-translate-y-1 flex items-center justify-center gap-2 group"
                >
                  Book a Court <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <button
                  onClick={scrollToFeatures}
                  className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-lg hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 group"
                >
                  <PlayCircle size={20} className="text-teal-600 group-hover:scale-110 transition-transform" />
                  How it Works
                </button>
              </div>
              
              <div className="mt-12 flex flex-wrap justify-center lg:justify-start gap-x-8 gap-y-4 text-slate-500 text-sm font-semibold animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-500" />
                  <span>Instant Confirmation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-500" />
                  <span>Secure Payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-500" />
                  <span>Free Cancellation</span>
                </div>
              </div>
            </div>

            <div className="flex-1 relative w-full max-w-xl lg:max-w-none animate-in fade-in slide-in-from-right-12 duration-1000 delay-300">
               <div 
                 className="relative z-10 rounded-3xl overflow-hidden shadow-2xl shadow-teal-200 border-8 border-white transform rotate-2 hover:rotate-0 transition-transform duration-700 aspect-[4/3] bg-slate-100 group"
                 onMouseEnter={() => setIsHeroHovered(true)}
                 onMouseLeave={() => setIsHeroHovered(false)}
               >
                 {HERO_IMAGES.map((img, index) => (
                   <img 
                     key={index}
                     src={img} 
                     alt={`Sports Court ${index + 1}`} 
                     className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${index === currentHeroImage ? 'opacity-100' : 'opacity-0'}`}
                   />
                 ))}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                 
                 {/* Navigation Arrows */}
                 <button 
                   onClick={(e) => { e.stopPropagation(); prevHeroImage(); }}
                   className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 backdrop-blur-md hover:bg-white/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                 >
                   <ChevronLeft size={24} />
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); nextHeroImage(); }}
                   className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 backdrop-blur-md hover:bg-white/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                 >
                   <ChevronRight size={24} />
                 </button>

                 {/* Dots */}
                 <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                   {HERO_IMAGES.map((_, idx) => (
                     <button
                       key={idx}
                       onClick={() => setCurrentHeroImage(idx)}
                       className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentHeroImage ? 'bg-white w-6' : 'bg-white/50 w-1.5 hover:bg-white/80'}`}
                     />
                   ))}
                 </div>

                 <div className="absolute bottom-6 left-6 right-6 text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex -space-x-2">
                            {[1,2,3].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" />
                                </div>
                            ))}
                        </div>
                        <span className="text-sm font-medium text-white/90">+42 players active now</span>
                    </div>
                 </div>
               </div>
               
               {/* Decorative elements */}
               <div className="absolute -top-12 -right-12 w-64 h-64 bg-teal-600/10 rounded-full blur-3xl -z-10"></div>
               <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl -z-10"></div>
               
               {/* Floating Card */}
               <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-4 animate-bounce duration-[3000ms]">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                    <Activity size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">Live Status</p>
                    <p className="text-slate-900 font-bold">Court 3 Available</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
        
        {/* Background Elements */}
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-teal-50 rounded-full blur-3xl opacity-50 -z-10"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl opacity-50 -z-10"></div>
      </div>

      {/* Stats Section */}
      <div className="bg-slate-900 py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
        <RevealOnScroll className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
            {STATS.map((stat, index) => (
                <div key={index} className="text-center hover:-translate-y-1 transition-transform duration-300">
                    <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">{stat.value}</div>
                    <div className="text-teal-200 font-medium text-sm uppercase tracking-wider">{stat.label}</div>
                </div>
            ))}
        </RevealOnScroll>
      </div>

      {/* Features Section */}
      <div ref={featuresRef} className="py-32 scroll-mt-20">
        <RevealOnScroll className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <div className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold uppercase tracking-wider mb-4">Why Choose Ventra</div>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6">Everything you need to play</h2>
            <p className="text-lg text-slate-600">Whether you're a casual player or a league manager, Ventra gives you the tools to organize your sports life.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Calendar}
              title="Smart Scheduling"
              description="View real-time availability across multiple venues and book your slot instantly without phone calls."
            />
            <FeatureCard 
              icon={Users}
              title="Team Management"
              description="Create teams, invite players, and track attendance for your weekly matches effortlessly."
            />
            <FeatureCard 
              icon={Trophy}
              title="Tournaments & Leagues"
              description="Join local competitions or organize your own with automated brackets and scoring."
            />
          </div>
        </RevealOnScroll>
      </div>

      {/* Testimonials Section */}
      <div className="py-32 relative overflow-hidden">
        <RevealOnScroll className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6">Trusted by Pros & Amateurs</h2>
            <p className="text-lg text-slate-600">Don't just take our word for it. Here's what our community has to say.</p>
          </div>

          <div className="relative max-w-5xl mx-auto">
            <div className="overflow-hidden rounded-3xl bg-white/60 backdrop-blur-sm p-10 md:p-16 shadow-xl border border-white/50 transition-all duration-500 relative">
              <div className="absolute top-8 left-8 text-teal-200 opacity-50">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21L14.017 18C14.017 16.896 14.325 16.053 14.941 15.471C15.557 14.89 16.503 14.599 17.779 14.599L18.017 14.599L18.017 11.599C16.617 11.599 15.557 11.308 14.837 10.726C14.117 10.144 13.757 9.144 13.757 7.726L13.757 3L19.017 3L19.017 9C19.017 9.896 18.709 10.739 18.093 11.321C17.477 11.903 16.531 12.194 15.255 12.194L15.017 12.194L15.017 15.194C16.417 15.194 17.477 15.485 18.197 16.067C18.917 16.649 19.277 17.649 19.277 19.067L19.277 21L14.017 21ZM5.01697 21L5.01697 18C5.01697 16.896 5.32497 16.053 5.94097 15.471C6.55697 14.89 7.50297 14.599 8.77897 14.599L9.01697 14.599L9.01697 11.599C7.61697 11.599 6.55697 11.308 5.83697 10.726C5.11697 10.144 4.75697 9.144 4.75697 7.726L4.75697 3L10.017 3L10.017 9C10.017 9.896 9.70897 10.739 9.09297 11.321C8.47697 11.903 7.53097 12.194 6.25497 12.194L6.01697 12.194L6.01697 15.194C7.41697 15.194 8.47697 15.485 9.19697 16.067C9.91697 16.649 10.277 17.649 10.277 19.067L10.277 21L5.01697 21Z" /></svg>
              </div>
              
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-24 h-24 rounded-full overflow-hidden mb-8 border-4 border-white shadow-lg ring-4 ring-teal-50">
                  <img 
                    src={TESTIMONIALS[currentTestimonial].avatar} 
                    alt={TESTIMONIALS[currentTestimonial].name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex gap-1 text-amber-400 mb-8">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={24} fill="currentColor" className="drop-shadow-sm" />
                  ))}
                </div>
                <blockquote className="text-2xl md:text-3xl text-slate-900 font-medium mb-10 leading-relaxed max-w-3xl">
                  "{TESTIMONIALS[currentTestimonial].content}"
                </blockquote>
                <div>
                  <div className="font-bold text-slate-900 text-lg">{TESTIMONIALS[currentTestimonial].name}</div>
                  <div className="text-teal-600 font-medium">{TESTIMONIALS[currentTestimonial].role}</div>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <button 
              onClick={() => setCurrentTestimonial((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-16 p-4 bg-white rounded-full shadow-xl text-slate-600 hover:text-teal-600 hover:scale-110 transition-all border border-slate-100"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={() => setCurrentTestimonial((prev) => (prev + 1) % TESTIMONIALS.length)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-16 p-4 bg-white rounded-full shadow-xl text-slate-600 hover:text-teal-600 hover:scale-110 transition-all border border-slate-100"
            >
              <ChevronRight size={24} />
            </button>

            {/* Dots */}
            <div className="flex justify-center gap-3 mt-10">
              {TESTIMONIALS.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonial(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentTestimonial ? 'bg-teal-600 w-8' : 'bg-slate-300 w-2 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </RevealOnScroll>
      </div>

      {/* FAQ Section */}
      <div ref={faqRef} className="py-24 scroll-mt-20">
        <RevealOnScroll className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6">Frequently Asked Questions</h2>
            <p className="text-lg text-slate-600">Have questions? We're here to help.</p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-3xl shadow-xl border border-white/50 p-8 md:p-10">
            {FAQS.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </RevealOnScroll>
      </div>

      {/* Contact Section */}
      <div className="py-24 relative">
        <RevealOnScroll className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold uppercase tracking-wider mb-4">Get in Touch</div>
              <h2 className="text-4xl font-extrabold text-slate-900 mb-6">We'd love to hear from you</h2>
              <p className="text-lg text-slate-600 mb-8">
                Have a question about our platform? Want to partner with us? Fill out the form and our team will get back to you within 24 hours.
              </p>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
                    <Mail size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Email Us</p>
                    <p className="text-slate-600">support@ventra.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
                    <Phone size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Call Us</p>
                    <p className="text-slate-600">+1 (555) 123-4567</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Visit Us</p>
                    <p className="text-slate-600">123 Sports Avenue, NY 10012</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-8 md:p-10 border border-white/50 shadow-lg">
              <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">First Name</label>
                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all bg-white" placeholder="John" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Last Name</label>
                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all bg-white" placeholder="Doe" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                  <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all bg-white" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Message</label>
                  <textarea rows={4} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all bg-white resize-none" placeholder="How can we help you?"></textarea>
                </div>
                <button type="submit" className="w-full py-4 bg-teal-600 text-white rounded-xl font-bold text-lg hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 hover:shadow-teal-300 hover:-translate-y-1 flex items-center justify-center gap-2">
                  Send Message <Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </RevealOnScroll>
      </div>

      {/* CTA Section */}
      <div className="py-24 bg-gradient-to-br from-teal-600 to-cyan-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <RevealOnScroll className="max-w-4xl mx-auto px-6 text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">Ready to get in the game?</h2>
            <p className="text-xl text-teal-100 mb-10 max-w-2xl mx-auto">Join thousands of players and facility owners who trust Ventra for their sports management needs.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link 
                    to="/login" 
                    className="px-8 py-4 bg-white text-teal-600 rounded-xl font-bold text-lg hover:bg-teal-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                    Create Free Account
                </Link>
                <Link 
                    to="/login" 
                    className="px-8 py-4 bg-teal-700/50 text-white border border-teal-400/30 rounded-xl font-bold text-lg hover:bg-teal-700 transition-all backdrop-blur-sm"
                >
                    List Your Facility
                </Link>
            </div>
        </RevealOnScroll>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <img src="/ventra-logo.png" alt="Ventra" className="h-16 w-auto" />
            </div>
            <p className="text-slate-400 mb-8 max-w-sm leading-relaxed">
              The ultimate platform for sports enthusiasts and facility owners. Book courts, manage teams, and organize tournaments with ease.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition-all duration-300"><Twitter size={20} /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition-all duration-300"><Facebook size={20} /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition-all duration-300"><Instagram size={20} /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition-all duration-300"><Linkedin size={20} /></a>
            </div>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Contact</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Mail size={18} className="text-teal-500 mt-0.5" />
                <span className="hover:text-white transition-colors cursor-pointer">support@ventra.com</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone size={18} className="text-teal-500 mt-0.5" />
                <span className="hover:text-white transition-colors cursor-pointer">+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-teal-500 mt-0.5" />
                <span className="hover:text-white transition-colors cursor-pointer">123 Sports Avenue, NY 10012</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Links</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/login" className="hover:text-teal-400 transition-colors flex items-center gap-2"><ChevronRight size={14} /> Sign In</Link></li>
              <li><Link to="/login" className="hover:text-teal-400 transition-colors flex items-center gap-2"><ChevronRight size={14} /> Register</Link></li>
              <li><a href="#" className="hover:text-teal-400 transition-colors flex items-center gap-2"><ChevronRight size={14} /> About Us</a></li>
              <li><a href="#" className="hover:text-teal-400 transition-colors flex items-center gap-2"><ChevronRight size={14} /> Privacy Policy</a></li>
              <li><a href="#" className="hover:text-teal-400 transition-colors flex items-center gap-2"><ChevronRight size={14} /> Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-slate-800 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Ventra Sports. All rights reserved.
        </div>
      </footer>
      </div>
    </div>
  );
}

function RevealOnScroll({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-1000 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'} ${className}`}>
      {children}
    </div>
  );
}

function FAQItem({ question, answer }: any) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button 
        className="w-full py-6 flex items-center justify-between text-left focus:outline-none group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-lg font-bold text-slate-900 group-hover:text-teal-600 transition-colors">{question}</span>
        <div className={`ml-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-teal-600 text-white rotate-180' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
            {isOpen ? <Minus size={16} /> : <Plus size={16} />}
        </div>
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-48 opacity-100 mb-6' : 'max-h-0 opacity-0'}`}
      >
        <p className="text-slate-600 leading-relaxed pr-12">{answer}</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: any) {
  return (
    <div className="bg-white/60 backdrop-blur-sm p-10 rounded-3xl shadow-sm border border-white/50 hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group">
      <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 mb-6 group-hover:bg-teal-600 group-hover:text-white transition-colors duration-300">
        <Icon size={28} />
      </div>
      <h3 className="text-2xl font-bold text-slate-900 mb-4 group-hover:text-teal-600 transition-colors">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
