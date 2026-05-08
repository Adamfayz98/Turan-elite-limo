import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import BookingForm from "@/components/BookingForm";
import Fleet from "@/components/Fleet";
import Services from "@/components/Services";
import Coverage from "@/components/Coverage";
import Testimonials from "@/components/Testimonials";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main data-testid="home-page" className="bg-[#050505] text-white">
      <Navbar />
      <Hero />
      <BookingForm />
      <Fleet />
      <Services />
      <Coverage />
      <Testimonials />
      <ContactForm />
      <Footer />
    </main>
  );
}
