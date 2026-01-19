import { Link, useSearchParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Code2, Cpu, Zap, Users, Shield, Rocket, ChevronRight, Sparkles, ArrowRight, Terminal, Layers, Globe, Braces } from "lucide-react";

const technologies = [
  { name: "React", description: "Frontend Framework" },
  { name: "Node.js", description: "Backend Runtime" },
  { name: "TypeScript", description: "Type Safety" },
  { name: "PostgreSQL", description: "Database" },
  { name: "AWS", description: "Cloud Infrastructure" },
  { name: "Docker", description: "Containerization" },
  { name: "GraphQL", description: "API Layer" },
  { name: "Kubernetes", description: "Orchestration" },
];

const features = [
  {
    icon: Code2,
    title: "Custom Development",
    description: "Bespoke software solutions crafted to solve your unique business challenges with cutting-edge technology.",
  },
  {
    icon: Cpu,
    title: "AI & Machine Learning",
    description: "Intelligent systems that learn and adapt, transforming data into actionable insights and automation.",
  },
  {
    icon: Globe,
    title: "Cloud Solutions",
    description: "Scalable, secure cloud architecture that grows with your business and optimizes performance.",
  },
  {
    icon: Layers,
    title: "System Integration",
    description: "Seamlessly connect disparate systems into a unified, efficient digital ecosystem.",
  },
  {
    icon: Shield,
    title: "Cybersecurity",
    description: "Robust security protocols protecting your digital assets from evolving threats.",
  },
  {
    icon: Rocket,
    title: "DevOps & Automation",
    description: "Streamlined CI/CD pipelines and infrastructure automation for rapid, reliable deployments.",
  },
];

const Index = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get("invite");

  // Redirect to apply page if invite token is present
  if (inviteId) {
    return <Navigate to={`/apply?invite=${inviteId}`} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-violet-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-indigo-600/10 rounded-full blur-[150px]" />
        {/* Grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-violet-500/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Braces className="h-5 w-5 text-white" />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-400/50 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold bg-gradient-to-r from-violet-200 via-purple-200 to-violet-200 bg-clip-text text-transparent hidden sm:inline">
                  Blueforge Technologies
                </span>
                <span className="text-lg font-bold bg-gradient-to-r from-violet-200 to-purple-200 bg-clip-text text-transparent sm:hidden">
                  Blueforge
                </span>
                <span className="text-[10px] text-violet-400/60 tracking-[0.2em] uppercase hidden sm:inline">Software Innovation</span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/apply">
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm text-violet-300 hover:text-violet-100 hover:bg-violet-500/10">
                  <span className="hidden sm:inline">Careers</span>
                  <span className="sm:hidden">Jobs</span>
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="rounded-xl text-xs sm:text-sm bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-lg shadow-violet-500/25 border-0">
                  <span className="hidden sm:inline">Client Portal</span>
                  <span className="sm:hidden">Login</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-28 sm:pt-40 pb-20 sm:pb-32 px-4 overflow-hidden">
        <div className="relative max-w-7xl mx-auto text-center">
          {/* Floating code elements */}
          <div className="absolute top-10 left-10 text-violet-500/20 font-mono text-sm hidden lg:block animate-pulse">
            {'<innovation>'}
          </div>
          <div className="absolute top-20 right-16 text-purple-500/20 font-mono text-sm hidden lg:block animate-pulse" style={{ animationDelay: '0.5s' }}>
            {'const future = await build();'}
          </div>
          <div className="absolute bottom-10 left-20 text-indigo-500/20 font-mono text-sm hidden lg:block animate-pulse" style={{ animationDelay: '1s' }}>
            {'</innovation>'}
          </div>
          
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-medium mb-8 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Terminal className="h-4 w-4" />
            <span>Building Tomorrow's Technology</span>
            <Sparkles className="h-4 w-4" />
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <span className="text-white">We Forge</span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              Digital Excellence
            </span>
          </h1>
          
          <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 sm:mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 px-4 leading-relaxed">
            Transform your vision into powerful software solutions. 
            We architect, design, and build applications that drive innovation and accelerate growth.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 px-4">
            <Link to="/auth">
              <Button size="lg" className="w-full sm:w-auto rounded-xl gap-2 h-14 px-8 text-base bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/40 transition-all duration-300 border-0 group">
                Start Your Project 
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/apply">
              <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl h-14 px-8 text-base border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/50 hover:text-violet-200 backdrop-blur-sm">
                <Zap className="h-4 w-4 mr-2" />
                Join Our Team
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 sm:mt-20 grid grid-cols-3 gap-4 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
            {[
              { value: '150+', label: 'Projects Delivered' },
              { value: '99%', label: 'Client Satisfaction' },
              { value: '24/7', label: 'Support Available' },
            ].map((stat, i) => (
              <div key={i} className="text-center p-4 rounded-2xl bg-violet-500/5 border border-violet-500/10 backdrop-blur-sm">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-300 to-purple-300 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        {/* Features Section */}
        <section className="py-20 sm:py-32 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 sm:mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-4">
                <Code2 className="h-3 w-3" />
                Our Services
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Full-Stack{' '}
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Capabilities
                </span>
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
                From concept to deployment, we deliver end-to-end software solutions that power modern businesses.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="group relative p-6 sm:p-8 rounded-2xl bg-slate-900/50 border border-violet-500/10 hover:border-violet-500/30 backdrop-blur-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 overflow-hidden"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Hover glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600/0 to-purple-600/0 group-hover:from-violet-600/5 group-hover:to-purple-600/10 transition-all duration-500" />
                  
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-all duration-300">
                      <feature.icon className="h-7 w-7 text-violet-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-violet-200 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack Section */}
        <section className="py-20 sm:py-32 px-4 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-purple-600/5 to-transparent" />
          <div className="max-w-7xl mx-auto relative">
            <div className="text-center mb-16 sm:mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-4">
                <Cpu className="h-3 w-3" />
                Tech Stack
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Powered by{' '}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Modern Tech
                </span>
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
                We leverage cutting-edge technologies to build scalable, maintainable, and performant applications.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {technologies.map((tech, index) => (
                <div
                  key={tech.name}
                  className="group relative p-5 sm:p-6 rounded-2xl bg-slate-900/30 border border-violet-500/10 hover:border-violet-500/30 backdrop-blur-sm transition-all duration-300 text-center animate-in fade-in slide-in-from-bottom-4 overflow-hidden"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600/0 to-purple-600/0 group-hover:from-violet-600/10 group-hover:to-purple-600/5 transition-all duration-300" />
                  <div className="relative">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:border-violet-500/40 transition-all duration-300">
                      <span className="text-xl sm:text-2xl font-bold bg-gradient-to-br from-violet-300 to-purple-300 bg-clip-text text-transparent">
                        {tech.name.charAt(0)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white text-sm sm:text-base group-hover:text-violet-200 transition-colors">{tech.name}</h3>
                    <p className="text-xs sm:text-sm text-slate-500">{tech.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 sm:py-32 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden">
              {/* Animated gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
              
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
              <div className="absolute bottom-0 left-0 w-60 h-60 bg-fuchsia-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
              
              {/* Grid pattern */}
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                  backgroundSize: '40px 40px'
                }}
              />
              
              <div className="relative p-8 sm:p-12 md:p-16 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-sm font-medium mb-6">
                  <Rocket className="h-4 w-4" />
                  Ready to Launch?
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                  Let's Build Something
                  <span className="block mt-2">Extraordinary Together</span>
                </h2>
                <p className="text-white/80 mb-10 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
                  Partner with Blueforge Technologies and transform your ideas into powerful, scalable software solutions.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/auth">
                    <Button size="lg" className="w-full sm:w-auto rounded-xl gap-2 h-14 px-8 text-base bg-white text-violet-700 hover:bg-white/90 shadow-2xl shadow-black/20 group">
                      Get Started 
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                  <Link to="/apply">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl h-14 px-8 text-base border-white/30 text-white hover:bg-white/10 hover:border-white/50">
                      <Users className="h-4 w-4 mr-2" />
                      We're Hiring
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative bg-slate-900/50 border-t border-violet-500/10 py-10 sm:py-14 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Braces className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="font-semibold text-white">Blueforge Technologies</span>
                <p className="text-xs text-violet-400/60">Software Innovation</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 text-center order-last sm:order-none">
              © {new Date().getFullYear()} Blueforge Technologies. All rights reserved.
            </p>
            <div className="flex gap-6 justify-center">
              <Link to="/apply" className="text-xs sm:text-sm text-slate-400 hover:text-violet-400 transition-colors">
                Careers
              </Link>
              <Link to="/auth" className="text-xs sm:text-sm text-slate-400 hover:text-violet-400 transition-colors">
                Client Portal
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
